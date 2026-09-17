import jwt
import datetime
import os
import json

SECRET_KEY = "dev-secret-change-this-in-real-use"
ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 8
USERS_FILE = os.path.join("data", "users.json")

# Default users if data/users.json does not exist
DEFAULT_USERS = {
    "admin": ["admin123", "Admin"],
    "hr_user": ["hr123", "HR"],
    "eng_user": ["eng123", "Engineering"],
    "finance_user": ["finance123", "Finance"],
    "it_user": ["it123", "IT"],
}


def _load_users() -> dict:
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    _save_users(DEFAULT_USERS)
    return dict(DEFAULT_USERS)


def _save_users(users: dict):
    os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)


USERS = _load_users()


def authenticate(username: str, password: str) -> str | None:
    """Returns a JWT if credentials are valid, else None."""
    user = USERS.get(username)
    if not user or user[0] != password:
        return None

    role = user[1]
    payload = {
        "sub": username,
        "role": role,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=TOKEN_EXPIRY_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    """Decodes and validates a JWT. Raises jwt.PyJWTError if invalid/expired."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def list_users() -> list[dict]:
    return [{"username": u, "role": info[1]} for u, info in USERS.items()]


def add_user(username: str, password: str, role: str) -> dict:
    if not username or not password or not role:
        raise ValueError("Username, password, and role are required.")
    if username in USERS:
        raise ValueError(f"User '{username}' already exists.")
    USERS[username] = [password, role]
    _save_users(USERS)
    return {"username": username, "role": role}


def delete_user(username: str) -> dict:
    if username not in USERS:
        raise ValueError(f"User '{username}' does not exist.")
    if username == "admin":
        raise ValueError("The main 'admin' user cannot be deleted.")
    del USERS[username]
    _save_users(USERS)
    return {"deleted": username}


def change_user_password(username: str, new_password: str) -> dict:
    if username not in USERS:
        raise ValueError(f"User '{username}' does not exist.")
    if not new_password:
        raise ValueError("New password cannot be empty.")
    USERS[username][0] = new_password
    _save_users(USERS)
    return {"username": username, "status": "password_updated"}
