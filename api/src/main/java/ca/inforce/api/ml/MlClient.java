package ca.inforce.api.ml;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriBuilder;

/** Thin client for the Python ML service. Responses are passed through as JSON. */
@Component
public class MlClient {

    private final RestClient http;

    public MlClient(RestClient mlRestClient) {
        this.http = mlRestClient;
    }

    public JsonNode regulations() {
        return get(u -> u.path("/regulations").build());
    }

    public JsonNode timeline(String regulationId, LocalDate asOf) {
        return get(u -> {
            UriBuilder b = u.path("/regulations/{id}/timeline");
            if (asOf != null) b.queryParam("as_of", asOf);
            return b.build(regulationId);
        });
    }

    public JsonNode evaluation() {
        return get(u -> u.path("/eval").build());
    }

    public JsonNode ask(Map<String, Object> body) {
        return call(() -> http.post().uri("/ask").contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class));
    }

    public boolean healthy() {
        try {
            JsonNode n = get(u -> u.path("/health").build());
            return n != null && "ok".equals(n.path("status").asText());
        } catch (MlServiceException e) {
            return false;
        }
    }

    private JsonNode get(java.util.function.Function<UriBuilder, java.net.URI> uri) {
        return call(() -> http.get().uri(uri).retrieve().body(JsonNode.class));
    }

    private JsonNode call(java.util.function.Supplier<JsonNode> request) {
        try {
            return request.get();
        } catch (RestClientResponseException e) {
            throw new MlServiceException(e.getStatusCode(), e.getResponseBodyAsString());
        } catch (ResourceAccessException e) {
            throw new MlServiceException(HttpStatusCode.valueOf(503), "ML service is unreachable");
        }
    }
}
