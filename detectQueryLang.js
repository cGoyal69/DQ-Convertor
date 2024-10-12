function detectQueryLang(query) {
    const definitiveMarkers = {
        PostgreSQL: {
            patterns: [
                /::\w+/,                                           // Type casting (e.g., "::text")
                /\b(?:JSONB|UUID|INET|CIDR|MACADDR|TSQUERY|TSVECTOR|JSON|HSTORE)\b/i,  // PostgreSQL-specific types
                /@>|\<@|\?\||\?&|\#>>|\#>\s/i,                     // Array and JSON operators
                /\bINTERVAL\b\s+'[\d\s]+(year|month|day|hour|minute|second)s?'/i,      // Interval syntax
                /\bREGEXP\b/i,                                             // Regular expressions in PostgreSQL
                /\bRETURNING\b/i,                                          // RETURNING clause in inserts/updates
                /\bON CONFLICT\b/i,                                        // Conflict handling in PostgreSQL
                /\bTABLESPACE\b/i,                                         // Table management
                /\bjson_build_object\b|\bjson_agg\b/i,                     // JSON functions
                /\bWITH RECURSIVE\b/i,                                     // Recursive queries
                /\bLATERAL\b/i,                                            // Lateral join
                /\bSERIAL\b|\bBIGSERIAL\b/i,                               // Auto-incrementing column types
                /\bCTID\b/i,                                               // CTID system column
                /\bEXCLUDE\b/i                                             // Exclusion constraints in indexes
            ],
            score: 100
        },
        SQLite: {
            patterns: [
                /\bSQLITE_\w+\b/,                                  // SQLite-specific functions
                /\bPRAGMA\b\s+\w+/i,                               // PRAGMA statements for system queries
                /\bRAISE\b\s*\(/i,                                 // Error handling in triggers
                /\bROWID\b/i,                                      // ROWID keyword (unique to SQLite)
                /\bWITHOUT ROWID\b/i,                              // Specialized tables in SQLite
                /\bAUTOINCREMENT\b/i                               // SQLite-specific auto-increment
            ],
            score: 100
        },
        MongoDB: {
            patterns: [
                /\bdb\.\w+\.(find|insert|update|delete|aggregate)(?:One|Many)?\(/i,  // MongoDB query structure
                /\{\s*\$[a-zA-Z]+:/i,                              // MongoDB operators like $gt, $lt
                /\bObjectId\(/i,                                   // MongoDB's ObjectId constructor
                /\bfindOneAndUpdate\(/i,                           // findOneAndUpdate function
                /\baggregate\b\s*\[/i,                             // Aggregation pipelines in MongoDB
                /\b\$group\b|\b\$match\b|\b\$project\b/i,          // Aggregation operators
            ],
            score: 100
        },
        Redis: {
            patterns: [
                /^(GET|SET|DEL|INCR|DECR|ZADD|HSET|HMGET|SADD|SREM|LPUSH|RPUSH|LRANGE|LTRIM|BLPOP|BRPOP|ZRANK|ZRANGE|ZREMRANGEBYSCORE|ZRANGEBYSCORE)\s/i  // Redis commands
            ],
            score: 100
        },
        Neo4j: {
            patterns: [
                /\bCYPHER\b/i,
                /\b(?:MATCH|MERGE|CREATE)\s*\(\w*\s*:\w+\)/i,      // Cypher node pattern
                /\bRETURN\b/i,                                     // Cypher's RETURN clause
                /\bWITH\b/i,                                       // WITH clause for result pipelining
                /\bOPTIONAL MATCH\b/i,                             // Optional matches in Cypher
                /\bUNWIND\b/i,                                     // UNWIND operation in Cypher
                /\bFOREACH\b/i,                                    // FOREACH loops in Cypher
            ],
            score: 100
        }
    };

    const generalPatterns = {
        SQL: {
            keywords: /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FROM|WHERE|GROUP BY|ORDER BY|HAVING|JOIN|UNION|INDEX|VIEW|PROCEDURE|TRIGGER)\b/i,
            features: /(\bJOIN\b|\bUNION\b|\bCONSTRAINT\b|\bFOREIGN KEY\b|\bPRIMARY KEY\b|\bCHECK\b|\bDISTINCT\b|\bEXISTS\b|\bLIMIT\b|\bOFFSET\b)/i,
            clauses: /\b(LEFT JOIN|RIGHT JOIN|FULL OUTER JOIN|INNER JOIN|CROSS JOIN|NATURAL JOIN)\b/i
        },
        Cassandra: {
            keywords: /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i,
            features: /(\bCONSISTENCY\b|\bTIMESTAMP\b|\bTTL\b|\bCOUNTER\b|\bBATCH\b|\bUSING\b|\bTOKEN\b|\bKEYSPACE\b|\bPRIMARY KEY\b)/i
        },
        XQuery: {
            keywords: /\b(for|let|where|order by|return|if|then|else|import module|declare|function)\b/i,
            features: /(\$\w+|\bnode\(\)|\btext\(\)|\bcomment\(\)|\bprocessing-instruction\(\)|\bdocument-node\(\))/i
        },
        jQuery: {
            keywords: /\$\(|\$\./,
            features: /\.(ajax|get|post|ready|on|click|submit|val|text|html|append|prepend|remove|addClass|removeClass|toggleClass|fadeIn|fadeOut|slideUp|slideDown|toggle)/i
        },
        RedisCLI: {
            keywords: /\b(redis-cli|info|monitor|config|client|ping|subscribe|unsubscribe|quit)\b/i,
            features: /(\bSET\b|\bGET\b|\bPUBLISH\b|\bSUBSCRIBE\b|\bKEYS\b|\bFLUSHALL\b|\bFLUSHDB\b)/i
        }
    };

    // Initialize scores for each language
    const scores = Object.keys({...generalPatterns, ...definitiveMarkers}).reduce((acc, key) => ({...acc, [key]: 0}), {});

    // Check for definitive markers first
    for (const [language, marker] of Object.entries(definitiveMarkers)) {
        for (const pattern of marker.patterns) {
            if (pattern.test(query)) {
                scores[language] += marker.score;
            }
        }
    }

    // If no definitive markers found, proceed with general detection
    if (Object.values(scores).every(score => score === 0)) {
        for (const [language, pattern] of Object.entries(generalPatterns)) {
            const keywordMatches = ((language === 'jQuery' ? query.toLowerCase() : query.toUpperCase()).match(pattern.keywords) || []).length;
            scores[language] += keywordMatches * 2;

            const featureMatches = (query.match(pattern.features) || []).length;
            scores[language] += featureMatches * 3;

            if (pattern.clauses) {
                const clauseMatches = (query.match(pattern.clauses) || []).length;
                scores[language] += clauseMatches * 5;
            }
        }

        // Additional SQL-specific detection
        if (/\b(SELECT|INSERT|UPDATE|DELETE)\b.*\b(FROM|INTO|SET|VALUES)\b/i.test(query) ||
            /\b(CREATE|ALTER|DROP)\b.*\b(TABLE|VIEW|INDEX|PROCEDURE)\b/i.test(query)) {
            scores.SQL += 5;
        }
    }

    // Find the language with the highest score
    let detectedLanguage = Object.entries(scores).reduce((max, [lang, score]) => 
        score > max[1] ? [lang, score] : max, ['Unknown', 0]);

    return detectedLanguage[0];
}
module.exports = detectQueryLang;


// Test queries with expected results
const testQueries = [
    {
        query: `let filteredData = users.filter(user => {
        return user.name === "john";
    });
    
    let groupedData = filteredData.reduce((acc, user) => {
        let groupKey = user.city;
        if (!acc[groupKey]) {
            acc[groupKey] = { totalUsers: 0 };
        }
        acc.totalUsers += user.1;
        return acc;
    }, {});
    
    let projectedData = Object.keys(groupedData).map(groupKey => {
        return { city: groupKey._id }, { totalUsers: groupKey.1 };
    });
    
    let sortedData = projectedData.sort((a, b) => {
        
        if (a.undefined < b.undefined) return 1;
        if (a.undefined > b.undefined) return -1;
        
        return 0;
    });
    
    let limitedData = sortedData.slice(0, 2);
    
    let lookedUpData = limitedData.map(item => {
        let lookupResult = orders.find(lookupItem => lookupItem.city === item.city);
        return { ...item, orders: lookupResult };
    });
    
    let unwoundData = lookedUpData.reduce((acc, item) => {
        if (Array.isArray(item.$orders)) {
            item.$orders.forEach((value, index) => {
                acc.push({ ...item, $orders: value, orderIndex: index });
            });
        } else if (preserveNullAndEmptyArrays) {
            acc.push(item);
        }
        return acc;
    }, []);
    
    let replacedRootData = unwoundData.map(item => {
        return $orders;
    });
    
    let addedFieldsData = replacedRootData.map(item => {
        return { ...item, { orderTotal: $total } };
    });
    
    let setFieldsData = addedFieldsData.map(item => {
        return { ...item, { orderTotal: $total } };
    });
    
    let unsetFieldsData = setFieldsData.map(item => {
        return { ...item, { total: undefined } };
    });`,
        expected: "JQuery"
    },
    {
        query: "SELECT * FROM users WHERE email::text LIKE '%@example.com'",
        expected: "PostgreSQL"
    },
    {
        query: "SELECT SQLITE_VERSION()",
        expected: "SQLite"
    },
    {
        query: "db.users.find({age: {$gt: 18}})",
        expected: "MongoDB"
    },
    {
        query: "CREATE TABLE users (id UUID PRIMARY KEY, data JSONB)",
        expected: "PostgreSQL"
    },
    {
        query: "PRAGMA table_info(users)",
        expected: "SQLite"
    },
    {
        query: "SELECT * FROM users WHERE created_at > NOW()",
        expected: "SQL"
    }
];

testQueries.forEach(({query, expected}) => {
    const result = detectQueryLang(query);
    console.log(result)
});
