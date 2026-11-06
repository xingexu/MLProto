package ca.inforce.api.config;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final InforceProperties props;

    public WebConfig(InforceProperties props) {
        this.props = props;
    }

    @Bean
    RestClient mlRestClient(RestClient.Builder builder) {
        HttpClient http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .version(HttpClient.Version.HTTP_1_1)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(props.mlTimeout());
        return builder.baseUrl(props.mlBaseUrl()).requestFactory(factory).build();
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (!props.allowedOrigins().isEmpty()) {
            registry.addMapping("/api/**")
                    .allowedOrigins(props.allowedOrigins().toArray(String[]::new))
                    .allowedMethods("GET", "POST", "DELETE");
        }
    }
}
