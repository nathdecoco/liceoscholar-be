/** Error carrying an HTTP status code, thrown from routes and middleware. */
export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function unauthorized(message = 'Authentication required'): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message = 'You do not have access to this resource'): HttpError {
  return new HttpError(403, message);
}

export function notFound(message = 'Resource not found'): HttpError {
  return new HttpError(404, message);
}
