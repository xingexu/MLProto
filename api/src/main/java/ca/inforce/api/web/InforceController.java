package ca.inforce.api.web;

import ca.inforce.api.ml.MlClient;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api")
public class InforceController {

    private final MlClient ml;

    public InforceController(MlClient ml) {
        this.ml = ml;
    }

    @PostMapping("/ask")
    public JsonNode ask(@Valid @RequestBody AskRequest request) {
        return ml.ask(request.toMlBody());
    }

    @GetMapping("/regulations")
    public JsonNode regulations() {
        return ml.regulations();
    }

    @GetMapping("/regulations/{id}/timeline")
    public JsonNode timeline(
            @PathVariable @Pattern(regexp = "[A-Za-z]-\\d{1,3}", message = "must look like B-20") String id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {
        return ml.timeline(id, asOf);
    }

    @GetMapping("/eval")
    public JsonNode evaluation() {
        return ml.evaluation();
    }
}
