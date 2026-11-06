package ca.inforce.api.watchlist;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WatchItemRepository extends JpaRepository<WatchItem, Long> {
    boolean existsByRegulationId(String regulationId);

    List<WatchItem> findAllByOrderByCreatedAtAsc();
}
