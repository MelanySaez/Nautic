import jwt
from datetime import datetime, timedelta, timezone
from django.conf import settings

ALGO = "HS256"
ACCESS_MIN = 60
REFRESH_DAYS = 7

def make_tokens(payload: dict):
    now = datetime.now(timezone.utc)
    access = jwt.encode(
        {"type": "access", "exp": now + timedelta(minutes=ACCESS_MIN), **payload},
        settings.SECRET_KEY, algorithm=ALGO
    )
    refresh = jwt.encode(
        {"type": "refresh", "exp": now + timedelta(days=REFRESH_DAYS), **payload},
        settings.SECRET_KEY, algorithm=ALGO
    )
    return access, refresh

def decode_token(token: str):
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGO])
