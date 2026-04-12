from fastapi import Header, HTTPException

from config import AI_SERVICE_SHARED_SECRET


def require_internal_service_auth(
    x_internal_api_key: str | None = Header(default=None, alias="x-internal-api-key"),
    authorization: str | None = Header(default=None),
):
    provided = x_internal_api_key

    if not provided and authorization:
        prefix = "bearer "
        lower = authorization.lower()
        if lower.startswith(prefix):
            provided = authorization[len(prefix):].strip()

    if not AI_SERVICE_SHARED_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Internal service auth is not configured",
        )

    if provided != AI_SERVICE_SHARED_SECRET:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized internal service request",
        )

    return True
