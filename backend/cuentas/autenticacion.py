from rest_framework.authentication import SessionAuthentication


class Sesion(SessionAuthentication):
    """Session auth that answers 401 (not 403) without a session, so the SPA knows to show the login.

    DRF only sends 401 when the authenticator declares a ``WWW-Authenticate`` value.
    """

    def authenticate_header(self, request):
        return 'Session'
