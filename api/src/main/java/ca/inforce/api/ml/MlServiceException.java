package ca.inforce.api.ml;

import org.springframework.http.HttpStatusCode;

public class MlServiceException extends RuntimeException {
    private final HttpStatusCode status;
    private final String body;

    public MlServiceException(HttpStatusCode status, String body) {
        super("ML service returned " + status.value());
        this.status = status;
        this.body = body;
    }

    public HttpStatusCode status() {
        return status;
    }

    public String body() {
        return body;
    }
}
