package ca.inforce.api.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

/**
 * Question from the web app. Field names are camelCase here and snake_case towards the ML service.
 */
public record AskRequest(
        @NotBlank @Size(min = 3, max = 500) String question,
        LocalDate asOf,
        @Pattern(regexp = "baseline|recency|lifecycle", message = "must be baseline, recency or lifecycle") String mode,
        LocalDate commitmentDate) {

    public Map<String, Object> toMlBody() {
        Map<String, Object> body = new HashMap<>();
        body.put("question", question.strip());
        if (asOf != null) body.put("as_of", asOf.toString());
        body.put("mode", mode == null ? "lifecycle" : mode);
        if (commitmentDate != null) body.put("situation", Map.of("commitment_date", commitmentDate.toString()));
        return body;
    }
}
