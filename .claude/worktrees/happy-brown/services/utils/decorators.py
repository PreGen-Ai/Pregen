import time
import logging
import inspect
from functools import wraps

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------
# 🔹 Helper: safely format arguments without dumping huge payloads
# ---------------------------------------------------------------------
def _safe_args_repr(args, kwargs):
    """Convert args/kwargs to safe log string, hide large dicts/lists."""
    def safe(v):
        if isinstance(v, (dict, list)):
            size = len(v)
            return f"<{type(v).__name__} size={size}>"
        return v

    safe_args = [safe(a) for a in args]
    safe_kwargs = {k: safe(v) for k, v in kwargs.items()}

    return safe_args, safe_kwargs


# ---------------------------------------------------------------------
# 🔹 Decorator: For any service function (sync or async)
# ---------------------------------------------------------------------
def log_execution(func):
    """
    Logs:
    - start event
    - execution time
    - errors
    Works for both async and sync functions.
    """
    is_coroutine = inspect.iscoroutinefunction(func)

    @wraps(func)
    async def async_wrapper(*args, **kwargs):
        safe_args, safe_kwargs = _safe_args_repr(args, kwargs)
        logger.info(f"🚀 {func.__name__} started | args={safe_args} kwargs={safe_kwargs}")

        start = time.time()
        try:
            result = await func(*args, **kwargs)
            duration = time.time() - start
            logger.info(f"✅ {func.__name__} completed in {duration:.2f}s")
            return result
        except Exception as e:
            logger.error(f"❌ {func.__name__} failed: {e}", exc_info=True)
            raise

    @wraps(func)
    def sync_wrapper(*args, **kwargs):
        safe_args, safe_kwargs = _safe_args_repr(args, kwargs)
        logger.info(f"🚀 {func.__name__} started | args={safe_args} kwargs={safe_kwargs}")

        start = time.time()
        try:
            result = func(*args, **kwargs)
            duration = time.time() - start
            logger.info(f"✅ {func.__name__} completed in {duration:.2f}s")
            return result
        except Exception as e:
            logger.error(f"❌ {func.__name__} failed: {e}", exc_info=True)
            raise

    return async_wrapper if is_coroutine else sync_wrapper


# ---------------------------------------------------------------------
# 🔹 Decorator: API Route Logging
# ---------------------------------------------------------------------
def log_route(func):
    """
    Decorator for FastAPI route functions.
    Logs:
    - route call start
    - execution time
    - errors
    - hides sensitive payloads
    """
    is_coroutine = inspect.iscoroutinefunction(func)

    @wraps(func)
    async def async_wrapper(*args, **kwargs):
        logger.info(f"➡️  API Route: {func.__name__} called")

        start = time.time()
        try:
            result = await func(*args, **kwargs)
            duration = time.time() - start
            logger.info(f"⬅️  API Route: {func.__name__} completed in {duration:.2f}s")
            return result
        except Exception as e:
            logger.error(f"❌ API Route {func.__name__} failed: {e}", exc_info=True)
            raise

    @wraps(func)
    def sync_wrapper(*args, **kwargs):
        logger.info(f"➡️  API Route: {func.__name__} called")

        start = time.time()
        try:
            result = func(*args, **kwargs)
            duration = time.time() - start
            logger.info(f"⬅️  API Route: {func.__name__} completed in {duration:.2f}s")
            return result
        except Exception as e:
            logger.error(f"❌ API Route {func.__name__} failed: {e}", exc_info=True)
            raise

    return async_wrapper if is_coroutine else sync_wrapper
