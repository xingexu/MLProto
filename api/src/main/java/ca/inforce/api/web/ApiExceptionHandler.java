package ca.inforce.api.web;

import ca.inforce.api.ml.MlServiceException;
import ca.inforce.api.watchlist.WatchlistConflictException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolationException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.validation.method.ParameterErrors;
import org.springframework.validation.method.ParameterValidationResult;

/** Every error leaves the API as RFC 9457 problem JSON with a human-readable detail. */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
public class ApiExceptionHandler {

    private final ObjectMapper mapper;

    public ApiExceptionHandler(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail invalidBody(MethodArgumentNotValidException e) {
        Map<String, String> errors = new LinkedHashMap<>();
        e.getBindingResult().getFieldErrors().forEach(f -> errors.putIfAbsent(f.getField(), f.getDefaultMessage()));
        ProblemDetail p = problem(HttpStatus.BAD_REQUEST, "Some fields are invalid.");
        p.setProperty("errors", errors);
        return p;
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ProblemDetail invalidMethodArgs(HandlerMethodValidationException e) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (ParameterValidationResult result : e.getAllValidationResults()) {
            if (result instanceof ParameterErrors pe) {
                pe.getFieldErrors().forEach(f -> errors.putIfAbsent(f.getField(), f.getDefaultMessage()));
            } else {
                String name = result.getMethodParameter().getParameterName();
                result.getResolvableErrors().stream().findFirst()
                        .ifPresent(err -> errors.putIfAbsent(name == null ? "parameter" : name, err.getDefaultMessage()));
            }
        }
        ProblemDetail p = problem(HttpStatus.BAD_REQUEST, "Some fields are invalid.");
        p.setProperty("errors", errors);
        return p;
    }

    @ExceptionHandler({ConstraintViolationException.class, MethodArgumentTypeMismatchException.class})
    ProblemDetail invalidParam(Exception e) {
        return problem(HttpStatus.BAD_REQUEST, "A request parameter is invalid.");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail unreadable(HttpMessageNotReadableException e) {
        return problem(HttpStatus.BAD_REQUEST, "The request body is not valid JSON or has a wrongly formatted field.");
    }

    @ExceptionHandler(NoSuchElementException.class)
    ProblemDetail notFound(NoSuchElementException e) {
        return problem(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(WatchlistConflictException.class)
    ProblemDetail conflict(WatchlistConflictException e) {
        return problem(HttpStatus.CONFLICT, e.getMessage());
    }

    @ExceptionHandler(MlServiceException.class)
    ProblemDetail ml(MlServiceException e) {
        HttpStatusCode upstream = e.status();
        if (upstream.value() == 404) {
            return problem(HttpStatus.NOT_FOUND, detailFrom(e.body(), "Not found."));
        }
        if (upstream.value() == 422) {
            return problem(HttpStatus.BAD_REQUEST, detailFrom(e.body(), "The request was rejected."));
        }
        if (upstream.value() == 503) {
            return problem(HttpStatus.SERVICE_UNAVAILABLE, "The answer service is unavailable. Try again shortly.");
        }
        return problem(HttpStatus.BAD_GATEWAY, "The answer service returned an error.");
    }

    private String detailFrom(String body, String fallback) {
        try {
            JsonNode detail = mapper.readTree(body).path("detail");
            if (detail.isTextual()) return detail.asText();
            if (detail.isArray() && !detail.isEmpty()) return detail.get(0).path("msg").asText(fallback);
        } catch (Exception ignored) {
            // fall through
        }
        return fallback;
    }

    private static ProblemDetail problem(HttpStatus status, String detail) {
        return ProblemDetail.forStatusAndDetail(status, detail);
    }
}
