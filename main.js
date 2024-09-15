function mongoTokens(query) {
    let bracket = ['1'], h = [], p = "", isString = false, prev = ' ';
    for(let i = 0; i < query.length; i++)
    {
        if (query[i] == ' ' && !isString)
            continue;
        else
        {
            if (bracket[bracket.length-1] != '(' || query[i] == '.')
            {
                if (query[i] == '(' || query[i] == '.')
                {
                    if (query[i] == '(')
                        bracket.push('(');
                    if (p.length != 0)
                        h.push(p)
                    p = "";
                }
                else
                    p+=query[i];
            }
            else if(query[i] == '\'' || query[i] == '"')
            {
                if (query[i] == prev)
                {
                    prev = ' ';
                    isString = false;
                    p+=query[i];
                }
                else if (prev == ' ')
                {
                    isString = true;
                    prev = query[i];
                    p+=query[i];
                }
            }
            else if(!isString)
            {
                if (query[i] == '(')
                    bracket.push('(');
                if(query[i] == ')')
                {
                    bracket.pop();
                    if (bracket[bracket.length-1] == '(')
                        p+=")";
                    if(p.length != 0 && bracket[bracket.length-1] == '1')
                    {
                        h.push(p);
                        p = "";
                    }
                }
                else
                    p+=query[i];
            }
            else
                p+=query[i];
        }
    }
    return h;
}

function parseCondition(field, condition) {
    const result = [];
    if (typeof condition === 'object' && !Array.isArray(condition)) {
      // Handle conditions like { "$gte": 18 }
      Object.keys(condition).forEach(operator => {
        result.push({
          field: field,
          operator: operator,
          value: condition[operator]
        });
      });
    } else {
      // Handle conditions like { age: 18 }
      result.push({
        field: field,
        operator: '=',
        value: condition
      });
    }
    return result;
}

tokens = mongoTokens('db.users.find({"$and": [{\"age\" : {\"$lt\" : 18}, {"$gt": 10}}]})');
