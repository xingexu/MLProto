package ca.inforce.api.watchlist;

public class WatchlistConflictException extends RuntimeException {
    public WatchlistConflictException(String message) {
        super(message);
    }
}
