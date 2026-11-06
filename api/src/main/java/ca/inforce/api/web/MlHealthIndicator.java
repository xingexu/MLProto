package ca.inforce.api.web;

import ca.inforce.api.ml.MlClient;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

@Component("mlService")
public class MlHealthIndicator implements HealthIndicator {
    private final MlClient ml;

    public MlHealthIndicator(MlClient ml) {
        this.ml = ml;
    }

    @Override
    public Health health() {
        return ml.healthy() ? Health.up().build() : Health.down().withDetail("reason", "ML service unreachable").build();
    }
}
