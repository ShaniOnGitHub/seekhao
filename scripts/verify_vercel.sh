#!/bin/bash
# Poll Vercel until the API endpoint returns 200 (with JWT/Groq envs) or a JSON error body.
for i in $(seq 1 20); do
  CODE=$(curl -s -o /tmp/v_body -w "%{http_code}" "https://seekhao.vercel.app/api/trpc" --max-time 25)
  BODY=$(head -c 200 /tmp/v_body)
  echo "attempt $i: HTTP $CODE — $BODY"
  if [ "$CODE" != "500" ]; then
    echo "API IS UP (status $CODE)"
    exit 0
  fi
  sleep 45
done
echo "still down after polling"
exit 1
