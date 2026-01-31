#!/bin/bash
# Increase file descriptor limit for Metro bundler
ulimit -n 10240

# Start Expo
exec npx expo start "$@"
