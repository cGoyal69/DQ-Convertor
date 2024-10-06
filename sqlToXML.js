function sqlToXml(sql) {
    // Normalize whitespace and remove extra spaces
    sql = sql.replace(/\s+/g, ' ').trim();

    // Regular expressions for different SQL clauses
    const patterns = {
        update: /UPDATE\s+(\w+)\s+SET\s+(.+?)(?=\s+WHERE|$)/i,
        insert: /INSERT INTO\s+(\w+)\s*\((.+?)\)\s+VALUES\s*\((.+?)\)/i,
        delete: /DELETE FROM\s+(\w+)(?=\s+WHERE|$)/i,
        create: /CREATE\s+TABLE\s+(\w+)\s*\((.+?)\)/i,
        drop: /DROP\s+TABLE\s+(\w+)/i,
        where: /WHERE\s+(.+?)(?=\s+(?:GROUP BY|HAVING|ORDER BY|LIMIT)|$)/i,
        with: /WITH\s+(.+?)(?=\s+SELECT|$)/i,
        select: /SELECT\s+(.+?)(?=\s+FROM|$)/i,
        from: /FROM\s+(.+?)(?=\s+(?:JOIN|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT)|$)/i,
        joins: /((INNER|LEFT|RIGHT|FULL OUTER|CROSS)?\s*JOIN\s+.+?(?=\s+(?:JOIN|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT)|$))/gi,
        groupBy: /GROUP\s+BY\s+(.+?)(?=\s+(?:HAVING|ORDER BY|LIMIT)|$)/i,
        having: /HAVING\s+(.+?)(?=\s+(?:ORDER BY|LIMIT)|$)/i,
        orderBy: /ORDER\s+BY\s+(.+?)(?=\s+LIMIT|$)/i,
        limit: /LIMIT\s+(.+)$/i,
        union: /UNION\s+(ALL\s+)?/i
    };

    // Function to escape XML special characters
    function escapeXml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    // Function to parse column expressions
    function parseColumns(columnsStr) {
        let columns = [];
        let depth = 0;
        let currentCol = '';
        let inQuote = false;
        let quoteChar = null;

        for (let i = 0; i < columnsStr.length; i++) {
            const char = columnsStr[i];
            if ((char === '"' || char === "'") && columnsStr[i - 1] !== '\\') {
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

    // Function to parse SET expressions
    function parseSet(setStr) {
        const sets = [];
        let currentSet = '';
        let depth = 0;
        let inQuote = false;
        let quoteChar = null;

        for (let i = 0; i < setStr.length; i++) {
            const char = setStr[i];

            if ((char === '"' || char === "'") && setStr[i - 1] !== '\\') {
                if (!inQuote) {
                    inQuote = true;
                    quoteChar = char;
                } else if (quoteChar === char) {
                    inQuote = false;
                    quoteChar = null;
                }
            }

            if (!inQuote) {
                if (char === ',') {
                    sets.push(currentSet.trim());
                    currentSet = '';
                } else {
                    currentSet += char;
                }
            } else {
                currentSet += char;
            }
        }

        if (currentSet) sets.push(currentSet.trim());
        return sets.map(set => {
            const match = set.match(/(.+?)\s*=\s*(.+)/);
            return match ? { column: match[1].trim(), value: match[2].trim() } : null;
        }).filter(Boolean);
    }

    // Function to parse INSERT expressions
    function parseInsert(insertMatch) {
        const table = insertMatch[1].trim();
        const columns = parseColumns(insertMatch[2]);
        const values = parseColumns(insertMatch[3]);
        return { table, columns, values };
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
            
            if ((char === '"' || char === "'") && conditionStr[i - 1] !== '\\') {
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

    // Parse UPDATE clause
    const updateMatch = sql.match(patterns.update);
    if (updateMatch) {
        const table = updateMatch[1];
        const setStr = updateMatch[2];
        xml += `  <update>\n`;
        xml += `    <table>${escapeXml(table)}</table>\n`;
        xml += `    <set>\n`;
        parseSet(setStr).forEach(set => {
            xml += `      <column>${escapeXml(set.column)}</column>\n`;
            xml += `      <value>${escapeXml(set.value)}</value>\n`;
        });
        xml += `    </set>\n`;
        const whereMatch = sql.match(patterns.where);
        if (whereMatch) {
            xml += `    <where>\n`;
            parseConditions(whereMatch[1]).forEach(condition => {
                xml += `      <condition>\n`;
                if (condition.raw) {
                    xml += `        <raw>${escapeXml(condition.raw)}</raw>\n`;
                } else {
                    xml += `        <column>${escapeXml(condition.column)}</column>\n`;
                    xml += `        <operator>${escapeXml(condition.operator)}</operator>\n`;
                    xml += `        <value>${escapeXml(condition.value)}</value>\n`;
                }
                xml += `      </condition>\n`;
            });
            xml += `    </where>\n`;
        }
        xml += `  </update>\n`;
    }

    // Parse INSERT clause
    const insertMatch = sql.match(patterns.insert);
    if (insertMatch) {
        const { table, columns, values } = parseInsert(insertMatch);
        xml += `  <insert>\n`;
        xml += `    <table>${escapeXml(table)}</table>\n`;
        xml += `    <columns>\n`;
        columns.forEach(col => {
            xml += `      <column>${escapeXml(col)}</column>\n`;
        });
        xml += `    </columns>\n`;
        xml += `    <values>\n`;
        values.forEach(val => {
            xml += `      <value>${escapeXml(val)}</value>\n`;
        });
        xml += `    </values>\n`;
        xml += `  </insert>\n`;
    }

    // Parse DELETE clause
    const deleteMatch = sql.match(patterns.delete);
    if (deleteMatch) {
        const table = deleteMatch[1];
        xml += `  <delete>\n`;
        xml += `    <table>${escapeXml(table)}</table>\n`;
        const whereMatch = sql.match(patterns.where);
        if (whereMatch) {
            xml += `    <where>\n`;
            parseConditions(whereMatch[1]).forEach(condition => {
                xml += `      <condition>\n`;
                if (condition.raw) {
                    xml += `        <raw>${escapeXml(condition.raw)}</raw>\n`;
                } else {
                    xml += `        <column>${escapeXml(condition.column)}</column>\n`;
                    xml += `        <operator>${escapeXml(condition.operator)}</operator>\n`;
                    xml += `        <value>${escapeXml(condition.value)}</value>\n`;
                }
                xml += `      </condition>\n`;
            });
            xml += `    </where>\n`;
        }
        xml += `  </delete>\n`;
    }

    // Parse CREATE TABLE clause
    const createMatch = sql.match(patterns.create);
    if (createMatch) {
        const table = createMatch[1];
        const columns = createMatch[2];
        xml += `  <create>\n`;
        xml += `    <table>${escapeXml(table)}</table>\n`;
        xml += `    <columns>\n`;
        parseColumns(columns).forEach(col => {
            xml += `      <column>${escapeXml(col)}</column>\n`;
        });
        xml += `    </columns>\n`;
        xml += `  </create>\n`;
    }

    // Parse DROP TABLE clause
    const dropMatch = sql.match(patterns.drop);
    if (dropMatch) {
        const table = dropMatch[1];
        xml += `  <drop>\n`;
        xml += `    <table>${escapeXml(table)}</table>\n`;
        xml += `  </drop>\n`;
    }

    // Parse SELECT clause
    const selectMatch = sql.match(patterns.select);
    if (selectMatch) {
        xml += `  <select>\n`;
        const columns = selectMatch[1];
        xml += `    <columns>\n`;
        parseColumns(columns).forEach(column => {
            xml += `      <column>${escapeXml(column)}</column>\n`;
        });
        xml += `    </columns>\n`;

        const fromMatch = sql.match(patterns.from);
        if (fromMatch) {
            xml += `    <from>\n`;
            parseColumns(fromMatch[1]).forEach(table => {
                xml += `      <table>${escapeXml(table)}</table>\n`;
            });
            xml += `    </from>\n`;
        }

        // Handle JOINs
        const joinMatches = sql.match(patterns.joins);
        if (joinMatches) {
            xml += `    <joins>\n`;
            joinMatches.forEach(joinStr => {
                const join = parseJoin(joinStr);
                if (join) {
                    xml += `      <join>\n`;
                    xml += `        <type>${escapeXml(join.type)}</type>\n`;
                    xml += `        <table>${escapeXml(join.table)}</table>\n`;
                    if (typeof join.condition === 'string') {
                        xml += `        <condition>${escapeXml(join.condition)}</condition>\n`;
                    } else {
                        xml += `        <leftColumn>${escapeXml(join.condition.leftColumn)}</leftColumn>\n`;
                        xml += `        <operator>${escapeXml(join.condition.operator)}</operator>\n`;
                        xml += `        <rightColumn>${escapeXml(join.condition.rightColumn)}</rightColumn>\n`;
                    }
                    xml += `      </join>\n`;
                }
            });
            xml += `    </joins>\n`;
        }

        // Handle WHERE conditions
        const whereMatch = sql.match(patterns.where);
        if (whereMatch) {
            xml += `    <where>\n`;
            parseConditions(whereMatch[1]).forEach(condition => {
                xml += `      <condition>\n`;
                if (condition.raw) {
                    xml += `        <raw>${escapeXml(condition.raw)}</raw>\n`;
                } else {
                    xml += `        <column>${escapeXml(condition.column)}</column>\n`;
                    xml += `        <operator>${escapeXml(condition.operator)}</operator>\n`;
                    xml += `        <value>${escapeXml(condition.value)}</value>\n`;
                }
                xml += `      </condition>\n`;
            });
            xml += `    </where>\n`;
        }

        // Handle GROUP BY conditions
        const groupByMatch = sql.match(patterns.groupBy);
        if (groupByMatch) {
            xml += `    <groupBy>\n`;
            parseColumns(groupByMatch[1]).forEach(group => {
                xml += `      <column>${escapeXml(group)}</column>\n`;
            });
            xml += `    </groupBy>\n`;
        }

        // Handle HAVING conditions
        const havingMatch = sql.match(patterns.having);
        if (havingMatch) {
            xml += `    <having>\n`;
            parseConditions(havingMatch[1]).forEach(condition => {
                xml += `      <condition>\n`;
                if (condition.raw) {
                    xml += `        <raw>${escapeXml(condition.raw)}</raw>\n`;
                } else {
                    xml += `        <column>${escapeXml(condition.column)}</column>\n`;
                    xml += `        <operator>${escapeXml(condition.operator)}</operator>\n`;
                    xml += `        <value>${escapeXml(condition.value)}</value>\n`;
                }
                xml += `      </condition>\n`;
            });
            xml += `    </having>\n`;
        }

        // Handle ORDER BY conditions
        const orderByMatch = sql.match(patterns.orderBy);
        if (orderByMatch) {
            xml += `    <orderBy>\n`;
            parseOrderBy(orderByMatch[1]).forEach(order => {
                xml += `      <column>${escapeXml(order.column)}</column>\n`;
                xml += `      <direction>${escapeXml(order.direction)}</direction>\n`;
            });
            xml += `    </orderBy>\n`;
        }

        // Handle LIMIT conditions
        const limitMatch = sql.match(patterns.limit);
        if (limitMatch) {
            xml += `    <limit>${escapeXml(limitMatch[1])}</limit>\n`;
        }

        xml += `  </select>\n`;
    }

    xml += '</query>';
    return xml;
}

// Example usage:
const sqlQuery = `UPDATE products SET price = price * 0.9 WHERE category_id = 5`;
console.log(sqlToXml(sqlQuery));
