function sqlToXml(sql) {
    // Normalize whitespace and remove extra spaces
    sql = sql.replace(/\s+/g, ' ').trim();

    // Regular expressions for different SQL clauses
    const patterns = {
        with: /WITH\s+(.+?)(?=\s+SELECT|$)/i,
        select: /SELECT\s+(.+?)(?=\s+FROM|$)/i,
        from: /FROM\s+(.+?)(?=\s+(?:JOIN|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT)|$)/i,
        joins: /((INNER|LEFT|RIGHT|FULL OUTER|CROSS)?\s*JOIN\s+.+?(?=\s+(?:JOIN|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT)|$))/gi,
        where: /WHERE\s+(.+?)(?=\s+(?:GROUP BY|HAVING|ORDER BY|LIMIT)|$)/i,
        groupBy: /GROUP\s+BY\s+(.+?)(?=\s+(?:HAVING|ORDER BY|LIMIT)|$)/i,
        having: /HAVING\s+(.+?)(?=\s+(?:ORDER BY|LIMIT)|$)/i,
        orderBy: /ORDER\s+BY\s+(.+?)(?=\s+LIMIT|$)/i,
        limit: /LIMIT\s+(.+)$/i,
        union: /UNION\s+(ALL\s+)?/i
    };

    // Function to parse column expressions
    function parseColumns(columnsStr) {
        let columns = [];
        let depth = 0;
        let currentCol = '';
        let inQuote = false;
        let quoteChar = null;

        for (let i = 0; i < columnsStr.length; i++) {
            const char = columnsStr[i];
            
            if ((char === '"' || char === "'") && columnsStr[i-1] !== '\\') {
                if (!inQuote) {
                    inQuote = true;
                    quoteChar = char;
                } else if (quoteChar === char) {
                    inQuote = false;
                    quoteChar = null;
                }
            }

            if (!inQuote) {
                if (char === '(') depth++;
                if (char === ')') depth--;
            }

            if (char === ',' && depth === 0 && !inQuote) {
                columns.push(currentCol.trim());
                currentCol = '';
            } else {
                currentCol += char;
            }
        }
        
        if (currentCol) columns.push(currentCol.trim());
        return columns;
    }

    // Function to parse JOIN conditions
    function parseJoin(joinStr) {
        const joinTypes = {
            'INNER JOIN': 'inner',
            'LEFT JOIN': 'left',
            'RIGHT JOIN': 'right',
            'FULL OUTER JOIN': 'fullOuter',
            'CROSS JOIN': 'cross'
        };

        let joinType = 'inner';
        Object.keys(joinTypes).forEach(type => {
            if (joinStr.toUpperCase().startsWith(type)) {
                joinType = joinTypes[type];
                joinStr = joinStr.substring(type.length).trim();
            }
        });

        const onMatch = /(.+?)\s+ON\s+(.+)/i.exec(joinStr);
        if (!onMatch) return null;

        const [, table, condition] = onMatch;
        const conditionMatch = condition.match(/(.+?)\s*(=|!=|>|>=|<|<=)\s*(.+)/);
        
        return {
            type: joinType,
            table: table.trim(),
            condition: conditionMatch ? {
                leftColumn: conditionMatch[1].trim(),
                operator: conditionMatch[2],
                rightColumn: conditionMatch[3].trim()
            } : condition.trim()
        };
    }

    // Function to parse WHERE/HAVING conditions
    function parseConditions(conditionStr) {
        const conditions = [];
        let depth = 0;
        let currentCondition = '';
        let inQuote = false;
        let quoteChar = null;

        for (let i = 0; i < conditionStr.length; i++) {
            const char = conditionStr[i];
            
            if ((char === '"' || char === "'") && conditionStr[i-1] !== '\\') {
                if (!inQuote) {
                    inQuote = true;
                    quoteChar = char;
                } else if (quoteChar === char) {
                    inQuote = false;
                    quoteChar = null;
                }
            }

            if (!inQuote) {
                if (char === '(') depth++;
                if (char === ')') depth--;
            }

            const isAndOr = /\b(AND|OR)\b/i.test(conditionStr.substr(i, 5));
            if (isAndOr && depth === 0 && !inQuote) {
                if (currentCondition) conditions.push(currentCondition.trim());
                currentCondition = '';
                i += 2; // Skip "AND" or "OR"
            } else {
                currentCondition += char;
            }
        }
        
        if (currentCondition) conditions.push(currentCondition.trim());
        
        return conditions.map(cond => {
            const match = cond.match(/(.+?)\s*(=|!=|>|>=|<|<=|LIKE|IN|NOT IN|EXISTS|NOT EXISTS)\s*(.+)/i);
            if (match) {
                return {
                    column: match[1].trim(),
                    operator: match[2].toUpperCase(),
                    value: match[3].trim()
                };
            }
            return { raw: cond.trim() };
        });
    }

    // Function to parse ORDER BY expressions
    function parseOrderBy(orderByStr) {
        return orderByStr.split(',').map(item => {
            const [column, direction] = item.trim().split(/\s+/);
            return {
                column: column.trim(),
                direction: (direction || 'ASC').toUpperCase()
            };
        });
    }

    // Build XML
    let xml = '<query>\n';

    // Parse each clause
    const clauses = {};
    Object.entries(patterns).forEach(([clause, regex]) => {
        const match = sql.match(regex);
        if (match) clauses[clause] = match[1];
    });

    // WITH clause
    if (clauses.with) {
        xml += '  <with>\n';
        // Parse CTE expressions here
        xml += '  </with>\n';
    }

    // SELECT clause
    if (clauses.select) {
        xml += '  <select>\n';
        parseColumns(clauses.select).forEach(col => {
            xml += `    <column>${escapeXml(col)}</column>\n`;
        });
        xml += '  </select>\n';
    }

    // FROM clause
    if (clauses.from) {
        xml += '  <from>\n';
        parseColumns(clauses.from).forEach(table => {
            xml += `    <table>${escapeXml(table)}</table>\n`;
        });
        xml += '  </from>\n';
    }

    // JOIN clauses
    if (clauses.joins) {
        const joins = sql.match(patterns.joins) || [];
        if (joins.length > 0) {
            xml += '  <joins>\n';
            joins.forEach(joinStr => {
                const join = parseJoin(joinStr);
                if (join) {
                    xml += `    <join type="${join.type}">\n`;
                    xml += `      <table>${escapeXml(join.table)}</table>\n`;
                    xml += '      <on>\n';
                    if (join.condition.leftColumn) {
                        xml += `        <leftColumn>${escapeXml(join.condition.leftColumn)}</leftColumn>\n`;
                        xml += `        <operator>${escapeXml(join.condition.operator)}</operator>\n`;
                        xml += `        <rightColumn>${escapeXml(join.condition.rightColumn)}</rightColumn>\n`;
                    } else {
                        xml += `        <condition>${escapeXml(join.condition)}</condition>\n`;
                    }
                    xml += '      </on>\n';
                    xml += '    </join>\n';
                }
            });
            xml += '  </joins>\n';
        }
    }

    // WHERE clause
    if (clauses.where) {
        xml += '  <where>\n';
        parseConditions(clauses.where).forEach(condition => {
            xml += '    <condition>\n';
            if (condition.raw) {
                xml += `      <raw>${escapeXml(condition.raw)}</raw>\n`;
            } else {
                xml += `      <column>${escapeXml(condition.column)}</column>\n`;
                xml += `      <operator>${escapeXml(condition.operator)}</operator>\n`;
                xml += `      <value>${escapeXml(condition.value)}</value>\n`;
            }
            xml += '    </condition>\n';
        });
        xml += '  </where>\n';
    }

    // GROUP BY clause
    if (clauses.groupBy) {
        xml += '  <groupBy>\n';
        parseColumns(clauses.groupBy).forEach(col => {
            xml += `    <column>${escapeXml(col)}</column>\n`;
        });
        xml += '  </groupBy>\n';
    }

    // HAVING clause
    if (clauses.having) {
        xml += '  <having>\n';
        parseConditions(clauses.having).forEach(condition => {
            xml += '    <condition>\n';
            if (condition.raw) {
                xml += `      <raw>${escapeXml(condition.raw)}</raw>\n`;
            } else {
                xml += `      <column>${escapeXml(condition.column)}</column>\n`;
                xml += `      <operator>${escapeXml(condition.operator)}</operator>\n`;
                xml += `      <value>${escapeXml(condition.value)}</value>\n`;
            }
            xml += '    </condition>\n';
        });
        xml += '  </having>\n';
    }

    // ORDER BY clause
    if (clauses.orderBy) {
        xml += '  <orderBy>\n';
        parseOrderBy(clauses.orderBy).forEach(order => {
            xml += '    <sort>\n';
            xml += `      <column>${escapeXml(order.column)}</column>\n`;
            xml += `      <direction>${order.direction}</direction>\n`;
            xml += '    </sort>\n';
        });
        xml += '  </orderBy>\n';
    }

    // LIMIT clause
    if (clauses.limit) {
        xml += `  <limit>${escapeXml(clauses.limit)}</limit>\n`;
    }

    xml += '</query>';
    return xml;
}

// Helper function to escape XML special characters
function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

// Test queries
const testQueries = [
    `SELECT id, name, COUNT(*) as count 
     FROM users 
     LEFT JOIN orders ON users.id = orders.user_id 
     WHERE status = 'active' AND (age > 25 OR points > 1000)
     GROUP BY id, name 
     HAVING count > 5 
     ORDER BY count DESC, name ASC 
     LIMIT 10`,

    `SELECT DISTINCT u.name, 
     CASE WHEN o.total > 1000 THEN 'VIP' ELSE 'Regular' END as customer_type
     FROM users u
     INNER JOIN (SELECT user_id, SUM(amount) as total 
                 FROM orders 
                 GROUP BY user_id) o ON u.id = o.user_id
     WHERE u.created_at >= '2024-01-01'`,

    `SELECT p.name, c.category_name, 
     COUNT(o.id) as order_count,
     SUM(o.quantity * p.price) as total_revenue
     FROM products p
     JOIN categories c ON p.category_id = c.id
     LEFT JOIN order_items o ON p.id = o.product_id
     WHERE p.is_active = true
     GROUP BY p.name, c.category_name
     HAVING total_revenue > 10000
     ORDER BY total_revenue DESC
     LIMIT 5`
];

// Test the function with each query
testQueries.forEach((query, index) => {
    console.log(`\nTest Query ${index + 1}:`);
    console.log(sqlToXml(query));
});