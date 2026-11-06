package ca.inforce.api.watchlist;

import ca.inforce.api.ml.MlClient;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.stream.StreamSupport;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/watchlist")
public class WatchlistController {

    public record CreateWatch(@NotBlank @Size(max = 16) String regulationId, @Size(max = 200) String note) {
    }

    public record WatchView(Long id, String regulationId, String note, Instant createdAt) {
        static WatchView of(WatchItem w) {
            return new WatchView(w.getId(), w.getRegulationId(), w.getNote(), w.getCreatedAt());
        }
    }

    private final WatchItemRepository repo;
    private final MlClient ml;

    public WatchlistController(WatchItemRepository repo, MlClient ml) {
        this.repo = repo;
        this.ml = ml;
    }

    @GetMapping
    public List<WatchView> list() {
        return repo.findAllByOrderByCreatedAtAsc().stream().map(WatchView::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WatchView add(@Valid @RequestBody CreateWatch body) {
        String id = body.regulationId().strip().toUpperCase(Locale.ROOT);
        JsonNode regs = ml.regulations();
        boolean known = StreamSupport.stream(regs.spliterator(), false).anyMatch(r -> id.equals(r.path("id").asText()));
        if (!known) {
            throw new NoSuchElementException("Unknown regulation " + id + ".");
        }
        if (repo.existsByRegulationId(id)) {
            throw new WatchlistConflictException(id + " is already on your watchlist.");
        }
        String note = body.note() == null || body.note().isBlank() ? null : body.note().strip();
        try {
            return WatchView.of(repo.save(new WatchItem(id, note)));
        } catch (DataIntegrityViolationException e) {
            throw new WatchlistConflictException(id + " is already on your watchlist.");
        }
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@PathVariable long id) {
        if (!repo.existsById(id)) {
            throw new NoSuchElementException("Watchlist item " + id + " does not exist.");
        }
        repo.deleteById(id);
    }
}
