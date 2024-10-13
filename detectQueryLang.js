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
        }
    };

    const generalPatterns = {
        SQL: {
            keywords: /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FROM|WHERE|GROUP BY|ORDER BY|HAVING|JOIN|UNION|INDEX|VIEW|PROCEDURE|TRIGGER)\b/i,
            features: /(\bJOIN\b|\bUNION\b|\bCONSTRAINT\b|\bFOREIGN KEY\b|\bPRIMARY KEY\b|\bCHECK\b|\bDISTINCT\b|\bEXISTS\b|\bLIMIT\b|\bOFFSET\b)/i,
            clauses: /\b(LEFT JOIN|RIGHT JOIN|FULL OUTER JOIN|INNER JOIN|CROSS JOIN|NATURAL JOIN)\b/i
        },
        
        XQuery: {
            keywords: /\b(for|let|where|order by|return|if|then|else|import module|declare|function)\b/i,
            features: /(\$\w+|\bnode\(\)|\btext\(\)|\bcomment\(\)|\bprocessing-instruction\(\)|\bdocument-node\(\))/i
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

/*
// Test queries with expected results
const testQueries = [
    {
        query: `WITH RECURSIVE subordinates AS (
            SELECT employee_id, manager_id, full_name
            FROM employees
            WHERE employee_id = 2
            UNION ALL
            SELECT e.employee_id, e.manager_id, e.full_name
            FROM employees e
            INNER JOIN subordinates s ON s.employee_id = e.manager_id
        )
        SELECT * FROM subordinates;`,
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
*/