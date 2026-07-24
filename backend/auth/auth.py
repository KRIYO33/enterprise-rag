"""
Simple JWT auth with hardcoded users, one per department, matching data/ structure.
Not production auth (real auth = hashed passwords in a DB + Auth0/Keycloak) -
this is a portfolio-project stand-in that still demonstrates real RBAC:
the /chat endpoint trusts ONLY the role inside the verified JWT, never a role
passed in the request body, so it can't be spoofed by the client.
"""
import jwt
import datetime

SECRET_KEY = "dev-secret-change-this-in-real-use"
ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 8

# username -> (password, role)
USERS = {
    "admin": ("admin123", "Admin"),
    "hr_user": ("hr123", "HR"),
    "eng_user": ("eng123", "Engineering"),
    "finance_user": ("finance123", "Finance"),
    "it_user": ("it123", "IT"),
}


def authenticate(username: str, password: str) -> str | None:
    """Returns a JWT if credentials are valid, else None."""
    user = USERS.get(username)
    if not user or user[0] != password:
        return None

    role = user[1]
    payload = {
        "sub": username,
        "role": role,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=TOKEN_EXPIRY_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    """Decodes and validates a JWT. Raises jwt.PyJWTError if invalid/expired."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
