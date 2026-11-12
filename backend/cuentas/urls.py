from django.urls import path

from . import views

urlpatterns = [
    path('api/auth/csrf/', views.api_auth_csrf, name='api_auth_csrf'),
    path('api/auth/login/', views.api_auth_login, name='api_auth_login'),
    path('api/auth/logout/', views.api_auth_logout, name='api_auth_logout'),
    path('api/auth/yo/', views.api_auth_yo, name='api_auth_yo'),
]
