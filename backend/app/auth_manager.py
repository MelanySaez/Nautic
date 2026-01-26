"""
Custom Authentication Manager
Extends core_engine.auth.AuthManager with user management functionality
"""

from typing import Optional, Dict
from core_engine.auth import AuthManager as BaseAuthManager


class CustomAuthManager(BaseAuthManager):
    """
    Custom AuthManager that extends the base AuthManager with user management.
    Stores users in memory (for production, use a real database).
    """

    def __init__(
        self,
        secret_key: str,
        algorithm: str = "PS512",
        access_token_expire_minutes: int = 30,
    ):
        """
        Initialize the CustomAuthManager.

        Args:
            secret_key: Secret key for JWT encoding/decoding
            algorithm: Algorithm to use for JWT (default: PS512)
            access_token_expire_minutes: Token expiration time in minutes (default: 30)
        """
        super().__init__(secret_key, algorithm, access_token_expire_minutes)
        # In-memory user storage: {username: hashed_password}
        # For production, replace with a real database
        self._users: Dict[str, str] = {}

    def create_user(self, username: str, password: str) -> None:
        """
        Create a new user with hashed password.

        Args:
            username: Username for the new user
            password: Plain text password to hash and store

        Raises:
            ValueError: If username already exists or is invalid
        """
        if not username or not password:
            raise ValueError("Username and password are required")

        if username in self._users:
            raise ValueError(f"User '{username}' already exists")

        # Hash the password and store the user
        hashed_password = self.hash_password(password)
        self._users[username] = hashed_password

    def authenticate_user(self, username: str, password: str) -> Optional[str]:
        """
        Authenticate a user and return a JWT token if successful.

        Args:
            username: Username to authenticate
            password: Plain text password to verify

        Returns:
            JWT token string if authentication successful, None otherwise
        """
        # Check if user exists
        if username not in self._users:
            return None

        # Verify password
        hashed_password = self._users[username]
        if not self.verify_password(password, hashed_password):
            return None

        # Create and return access token
        token_data = {"sub": username}
        return self.create_access_token(token_data)

    def user_exists(self, username: str) -> bool:
        """
        Check if a user exists.

        Args:
            username: Username to check

        Returns:
            True if user exists, False otherwise
        """
        return username in self._users

    def get_all_users(self) -> list:
        """
        Get list of all usernames (for debugging/admin purposes).

        Returns:
            List of all usernames
        """
        return list(self._users.keys())
