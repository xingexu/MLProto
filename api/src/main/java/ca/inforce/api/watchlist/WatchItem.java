package ca.inforce.api.watchlist;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "watch_item")
public class WatchItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "regulation_id", nullable = false, unique = true, length = 16)
    private String regulationId;

    @Column(length = 200)
    private String note;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected WatchItem() {
    }

    public WatchItem(String regulationId, String note) {
        this.regulationId = regulationId;
        this.note = note;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getRegulationId() {
        return regulationId;
    }

    public String getNote() {
        return note;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
