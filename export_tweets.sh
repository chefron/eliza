#!/bin/bash
today=$(date +%Y%m%d)
output_file="twitter_logs_${today}.csv"

# Export from SQLite
sqlite3 ./agent/data/db.sqlite << EOF
.mode csv
.headers on
.output "${output_file}"
SELECT 
    datetime(createdAt/1000, 'unixepoch') as Date,
    json_extract(content, '$.text') as Tweet,
    json_extract(content, '$.url') as URL
FROM memories 
WHERE content LIKE '%twitter%' 
ORDER BY createdAt DESC;
EOF

# Append to master log if it exists, create if it doesn't
if [ -f master_twitter_log.csv ]; then
    # Skip header when appending
    tail -n +2 "${output_file}" >> master_twitter_log.csv
else
    cp "${output_file}" master_twitter_log.csv
fi

echo "Logs exported to ${output_file} and appended to master_twitter_log.csv"