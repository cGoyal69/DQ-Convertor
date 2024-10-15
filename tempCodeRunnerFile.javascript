class SQLParser {
    constructor(tokens) {
      this.tokens = tokens;
      this.index = 0;
    }
  
    parse() {
      return this.parseQuery();
    }
  
    parseQuery() {
      const query = { type: 'SELECT' };
      this.consumeKeyword('WITH');
      if (this.peekKeyword('RECURSIVE')) {
        this.consumeKeyword('RECURSIVE');
        query.recursive = true;
      }
      query.ctes = this.parseCTEs();
      this.consumeKeyword('SELECT');
      query.columns = this.parseColumnList();
      this.consumeKeyword('FROM');
      query.from = this.parseFromClause();
      query.where = this.parseWhereClause();
      query.groupBy = this.parseGroupByClause();
      query.having = this.parseHavingClause();
      query.orderBy = this.parseOrderByClause();
      query.limit = this.parseLimitClause();
      query.offset = this.parseOffsetClause();
      return query;
    }
  
    parseCTEs() {
      const ctes = [];
      while (this.peekKeyword('RECURSIVE') || this.peek().type === 'IDENTIFIER') {
        const cte = { name: this.consumeIdentifier() };
        this.consume('LPAREN');
        cte.query = this.parseQuery();
        this.consume('RPAREN');
        ctes.push(cte);
        if (this.peek().type !== 'COMMA') break;
        this.consume('COMMA');
      }
      return ctes;
    }
  
    parseColumnList() {
      const columns = [];
      do {
        columns.push(this.parseExpression());
        if (this.peek().type !== 'COMMA') break;
        this.consume('COMMA');
      } while (true);
      return columns;
    }
  
    parseFromClause() {
      const from = { type: 'FROM' };
      from.source = this.parseTableExpression();
      while (this.peekKeyword('JOIN')) {
        const join = { type: this.consumeKeyword(['LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN']) };
        join.right = this.parseTableExpression();
        if (this.peekKeyword('ON')) {
          this.consumeKeyword('ON');
          join.condition = this.parseExpression();
        }
        from.joins = from.joins || [];
        from.joins.push(join);
      }
      return from;
    }
  
    parseTableExpression() {
      if (this.peek().type === 'LPAREN') {
        this.consume('LPAREN');
        const subquery = this.parseQuery();
        this.consume('RPAREN');
        return { type: 'SUBQUERY', query: subquery };
      }
      return { type: 'TABLE', name: this.consumeIdentifier() };
    }
  
    parseWhereClause() {
      if (!this.peekKeyword('WHERE')) return null;
      this.consumeKeyword('WHERE');
      return this.parseExpression();
    }
  
    parseGroupByClause() {
      if (!this.peekKeyword('GROUP BY')) return null;
      this.consumeKeyword('GROUP BY');
      return this.parseColumnList();
    }
  
    parseHavingClause() {
      if (!this.peekKeyword('HAVING')) return null;
      this.consumeKeyword('HAVING');
      return this.parseExpression();
    }
  
    parseOrderByClause() {
      if (!this.peekKeyword('ORDER BY')) return null;
      this.consumeKeyword('ORDER BY');
      const orderBy = [];
      do {
        const item = { expression: this.parseExpression() };
        if (this.peekKeyword('ASC')) {
          this.consumeKeyword('ASC');
          item.direction = 'ASC';
        } else if (this.peekKeyword('DESC')) {
          this.consumeKeyword('DESC');
          item.direction = 'DESC';
        }
        orderBy.push(item);
        if (this.peek().type !== 'COMMA') break;
        this.consume('COMMA');
      } while (true);
      return orderBy;
    }
  
    parseLimitClause() {
      if (!this.peekKeyword('LIMIT')) return null;
      this.consumeKeyword('LIMIT');
      return this.parseExpression();
    }
  
    parseOffsetClause() {
      if (!this.peekKeyword('OFFSET')) return null;
      this.consumeKeyword('OFFSET');
      return this.parseExpression();
    }
  
    parseExpression() {
      let expr = this.parseTerm();
      while (this.peek().type === 'OPERATOR') {
        const op = this.consume('OPERATOR');
        const right = this.parseTerm();
        expr = { type: 'BINARY_OPERATION', left: expr, operator: op, right };
      }
      return expr;
    }
  
    parseTerm() {
      if (this.peek().type === 'NUMBER') {
        return { type: 'NUMBER', value: parseFloat(this.consume('NUMBER')) };
      }
      if (this.peek().type === 'STRING') {
        return { type: 'STRING', value: this.consume('STRING') };
      }
      if (this.peek().type === 'IDENTIFIER') {
        return { type: 'IDENTIFIER', name: this.consumeIdentifier() };
      }
      if (this.peek().type === 'LPAREN') {
        this.consume('LPAREN');
        const expr = this.parseExpression();
        this.consume('RPAREN');
        return expr;
      }
      throw new Error('Unexpected token: ' + JSON.stringify(this.peek()));
    }
  
    consumeKeyword(keyword) {
      if (Array.isArray(keyword)) {
        for (const kw of keyword) {
          if (this.peekKeyword(kw)) {
            return this.consumeKeyword(kw);
          }
        }
        throw new Error('Expected one of: ' + keyword.join(', '));
      }
      if (!this.peekKeyword(keyword)) {
        throw new Error('Expected keyword: ' + keyword);
      }
      this.index++;
      return keyword;
    }
  
    consumeIdentifier() {
      if (this.peek().type !== 'IDENTIFIER') {
        throw new Error('Expected identifier');
      }
      return this.consume('IDENTIFIER');
    }
  
    consume(type) {
      if (this.peek().type !== type) {
        throw new Error('Expected token type: ' + type);
      }
      return this.tokens[this.index++].value;
    }
  
    peek() {
      return this.tokens[this.index] || { type: 'EOF' };
    }
  
    peekKeyword(keyword) {
      return this.peek().type === 'KEYWORD' && this.peek().value.toUpperCase() === keyword.toUpperCase();
    }
  }
  
  function tokenize(sql) {
    const tokens = [];
    const regex = /(\s+)|(--.*$)|(\/\*[\s\S]*?\*\/)|(["'])(?:\\.|[^\\])*?\4|([a-zA-Z_]\w*)|([-+*\/=<>!]+)|([(),;])|(\d+(?:\.\d+)?)/g;
    let match;
    while ((match = regex.exec(sql)) !== null) {
      if (match[2] || match[3]) continue; // Skip comments
      if (!match[1]) { // Skip whitespace
        const value = match[0];
        const type = match[4] ? 'STRING'
          : match[5] ? (/^(SELECT|FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|JOIN|ON|AND|OR|NOT|IN|LIKE|BETWEEN|IS NULL|IS NOT NULL|TRUE|FALSE|ASC|DESC|WITH|RECURSIVE|UNION|INTERSECT|EXCEPT)$/i.test(value) ? 'KEYWORD' : 'IDENTIFIER')
          : match[6] ? 'OPERATOR'
          : match[7] ? value
          : 'NUMBER';
        tokens.push({ type, value });
      }
    }
    console.log(tokens); // Print tokens for debugging
    return tokens;
  }
  
  function postgresqlToJson(sql) {
    const tokens = tokenize(sql);
    const parser = new SQLParser(tokens);
    const ast = parser.parse();
    return convertAstToJson(ast);
  }
  
  function convertAstToJson(ast) {
    const result = {
      collection: ast.from.source.name,
      operation: 'aggregate',
      pipeline: []
    };
  
    if (ast.where) {
      result.pipeline.push({ $match: convertExpressionToJson(ast.where) });
    }
  
    if (ast.groupBy) {
      const groupStage = { $group: { _id: {} } };
      ast.groupBy.forEach((column, index) => {
        groupStage.$group._id[`field${index}`] = `$${column.name}`;
      });
      result.pipeline.push(groupStage);
    }
  
    if (ast.having) {
      result.pipeline.push({ $match: convertExpressionToJson(ast.having) });
    }
  
    if (ast.orderBy) {
      const sortStage = { $sort: {} };
      ast.orderBy.forEach(item => {
        sortStage.$sort[item.expression.name] = item.direction === 'DESC' ? -1 : 1;
      });
      result.pipeline.push(sortStage);
    }
  
    if (ast.limit) {
      result.pipeline.push({ $limit: parseInt(ast.limit.value) });
    }
  
    if (ast.offset) {
      result.pipeline.push({ $skip: parseInt(ast.offset.value) });
    }
  
    return result;
  }
  
  function convertExpressionToJson(expr) {
    if (expr.type === 'BINARY_OPERATION') {
      const left = convertExpressionToJson(expr.left);
      const right = convertExpressionToJson(expr.right);
      switch (expr.operator) {
        case '=': return { [left]: { $eq: right } };
        case '!=': return { [left]: { $ne: right } };
        case '>': return { [left]: { $gt: right } };
        case '>=': return { [left]: { $gte: right } };
        case '<': return { [left]: { $lt: right } };
        case '<=': return { [left]: { $lte: right } };
        case 'AND': return { $and: [left, right] };
        case 'OR': return { $or: [left, right] };
        default: throw new Error('Unsupported operator: ' + expr.operator);
      }
    } else if (expr.type === 'IDENTIFIER') {
      return `$${expr.name}`;
    } else if (expr.type === 'NUMBER' || expr.type === 'STRING') {
      return expr.value;
    } else {
      throw new Error('Unsupported expression type: ' + expr.type);
    }
  }
  
  // Example usage
  const sqlQuery = `
  WITH RECURSIVE subordinates AS (
    SELECT employee_id, manager_id, full_name
    FROM employees
    WHERE employee_id = 2
    UNION
    SELECT e.employee_id, e.manager_id, e.full_name
    FROM employees e
    INNER JOIN subordinates s ON s.employee_id = e.manager_id
  )
  SELECT d.department_name, COUNT(s.employee_id) AS employee_count
  FROM subordinates s
  JOIN departments d ON s.department_id = d.department_id
  WHERE d.location_id IN (1700, 1800)
  GROUP BY d.department_name
  HAVING COUNT(s.employee_id) > 5
  ORDER BY employee_count DESC
  LIMIT 10
  OFFSET 2
  `;
  
  const jsonResult = postgresqlToJson(sqlQuery);
  console.log(JSON.stringify(jsonResult, null, 2));
  