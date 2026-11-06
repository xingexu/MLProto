package ca.inforce.api;

import ca.inforce.api.config.InforceProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(InforceProperties.class)
public class InforceApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(InforceApiApplication.class, args);
    }
}
