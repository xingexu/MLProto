package ca.inforce.api.config;

import jakarta.validation.constraints.NotBlank;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * @param mlBaseUrl      base URL of the Python ML service
 * @param mlTimeout      read timeout for ML calls
 * @param allowedOrigins browser origins allowed to call the API directly (the web app normally proxies)
 */
@Validated
@ConfigurationProperties(prefix = "inforce")
public record InforceProperties(@NotBlank String mlBaseUrl, Duration mlTimeout, List<String> allowedOrigins) {
    public InforceProperties {
        if (mlTimeout == null) mlTimeout = Duration.ofSeconds(10);
        if (allowedOrigins == null) allowedOrigins = List.of();
    }
}
