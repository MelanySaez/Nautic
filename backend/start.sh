#!/bin/bash

# Wait for database to be ready
echo "Waiting for database..."
while ! pg_isready -h $DB_HOST -p $DB_PORT -U $POSTGRES_USER; do
  echo "Database is unavailable - sleeping"
  sleep 1
done

echo "Database is up - executing command"

# Run migrations
python manage.py migrate

# Start server
python manage.py runserver 0.0.0.0:8000
