package ca.inforce.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ca.inforce.api.ml.MlClient;
import ca.inforce.api.ml.MlServiceException;
import ca.inforce.api.watchlist.WatchItemRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.RestClient;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class InforceApiTest {

    /** Minimal stand-in for the Python ML service. */
    static final HttpServer STUB;
    static final AtomicReference<String> LAST_ASK_BODY = new AtomicReference<>();

    static {
        try {
            STUB = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        STUB.createContext("/", ex -> {
            String path = ex.getRequestURI().getPath();
            String body;
            int code = 200;
            if (path.equals("/health")) {
                body = "{\"status\":\"ok\"}";
            } else if (path.equals("/regulations")) {
                body = "[{\"id\":\"B-20\"},{\"id\":\"E-21\"}]";
            } else if (path.equals("/regulations/B-20/timeline")) {
                body = "{\"regulation\":{\"id\":\"B-20\"},\"query\":\"" + ex.getRequestURI().getQuery() + "\"}";
            } else if (path.startsWith("/regulations/")) {
                code = 404;
                body = "{\"detail\":\"Unknown regulation 'Z-99'\"}";
            } else if (path.equals("/ask")) {
                LAST_ASK_BODY.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                body = "{\"status\":\"IN_FORCE\",\"answer\":\"stub\"}";
            } else if (path.equals("/eval")) {
                body = "{\"n_questions\":1,\"modes\":{}}";
            } else {
                code = 404;
                body = "{\"detail\":\"Not Found\"}";
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(code, bytes.length);
            ex.getResponseBody().write(bytes);
            ex.close();
        });
        STUB.start();
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("inforce.ml-base-url", () -> "http://127.0.0.1:" + STUB.getAddress().getPort());
    }

    @AfterAll
    static void stop() {
        STUB.stop(0);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired WatchItemRepository repo;

    @BeforeEach
    void clean() {
        repo.deleteAll();
    }

    @Test
    void askIsForwardedInSnakeCase() throws Exception {
        mvc.perform(post("/api/ask").contentType(MediaType.APPLICATION_JSON).content("""
                        {"question":"  minimum qualifying rate  ","asOf":"2021-07-15","commitmentDate":"2021-05-10"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_FORCE"));
        JsonNode sent = json.readTree(LAST_ASK_BODY.get());
        assertThat(sent.path("question").asText()).isEqualTo("minimum qualifying rate");
        assertThat(sent.path("as_of").asText()).isEqualTo("2021-07-15");
        assertThat(sent.path("mode").asText()).isEqualTo("lifecycle");
        assertThat(sent.path("situation").path("commitment_date").asText()).isEqualTo("2021-05-10");
    }

    @Test
    void askValidation() throws Exception {
        mvc.perform(post("/api/ask").contentType(MediaType.APPLICATION_JSON).content("{\"question\":\" \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.question").exists());
        mvc.perform(post("/api/ask").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\":\"rate\",\"mode\":\"magic\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.mode").value("must be baseline, recency or lifecycle"));
        mvc.perform(post("/api/ask").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\":\"rate\",\"asOf\":\"not-a-date\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void timelinePassesDateAndMapsErrors() throws Exception {
        mvc.perform(get("/api/regulations/B-20/timeline").param("asOf", "2021-05-25"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("as_of=2021-05-25"));
        mvc.perform(get("/api/regulations/Z-99/timeline"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Unknown regulation 'Z-99'"));
        mvc.perform(get("/api/regulations/not_valid/timeline")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/regulations/B-20/timeline").param("asOf", "yesterday"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void evalAndRegulationsPassThrough() throws Exception {
        mvc.perform(get("/api/eval")).andExpect(status().isOk()).andExpect(jsonPath("$.n_questions").value(1));
        mvc.perform(get("/api/regulations")).andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value("B-20"));
    }

    @Test
    void watchlistLifecycle() throws Exception {
        String created = mvc.perform(post("/api/watchlist").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"regulationId\":\" b-20 \",\"note\":\"mortgage team\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.regulationId").value("B-20"))
                .andReturn().getResponse().getContentAsString();
        long id = json.readTree(created).path("id").asLong();

        mvc.perform(post("/api/watchlist").contentType(MediaType.APPLICATION_JSON).content("{\"regulationId\":\"B-20\"}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/watchlist").contentType(MediaType.APPLICATION_JSON).content("{\"regulationId\":\"Q-1\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/watchlist").contentType(MediaType.APPLICATION_JSON).content("{\"regulationId\":\"\"}"))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/api/watchlist")).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(delete("/api/watchlist/" + id)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/watchlist/" + id)).andExpect(status().isNotFound());
        mvc.perform(get("/api/watchlist")).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void unreachableMlServiceIs503() throws Exception {
        int freePort;
        try (ServerSocket s = new ServerSocket(0)) {
            freePort = s.getLocalPort();
        }
        MlClient down = new MlClient(RestClient.builder().baseUrl("http://127.0.0.1:" + freePort).build());
        assertThatThrownBy(down::regulations)
                .isInstanceOf(MlServiceException.class)
                .satisfies(e -> assertThat(((MlServiceException) e).status().value()).isEqualTo(503));
        assertThat(down.healthy()).isFalse();
    }
}
