#!/bin/sh
set -e

echo "Applying database migrations..."
node migrate.js

echo "Starting CardQuorum..."
exec node main.js
