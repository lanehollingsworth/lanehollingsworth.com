/**
 * Tiny arithmetic evaluator for budget formulas.
 *
 * Deliberately not `eval`: formulas live in data files, and data files should
 * never be able to execute code. Supports numbers, dotted identifiers,
 * + - * / ( ) and unary minus. An unknown identifier throws rather than
 * quietly evaluating to zero - a typo must never become a $0 line item.
 */

const NUMBER = /^\d+(\.\d+)?/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*/;

function tokenize(input) {
  const tokens = [];
  let rest = input.trim();
  while (rest.length > 0) {
    if (/^\s/.test(rest)) {
      rest = rest.trimStart();
      continue;
    }
    const num = rest.match(NUMBER);
    if (num) {
      tokens.push({ type: 'number', value: Number(num[0]) });
      rest = rest.slice(num[0].length);
      continue;
    }
    const ident = rest.match(IDENT);
    if (ident) {
      tokens.push({ type: 'ident', value: ident[0] });
      rest = rest.slice(ident[0].length);
      continue;
    }
    if ('+-*/()'.includes(rest[0])) {
      tokens.push({ type: 'op', value: rest[0] });
      rest = rest.slice(1);
      continue;
    }
    throw new Error(`Unexpected character "${rest[0]}" in formula: ${input}`);
  }
  return tokens;
}

export function evaluate(formula, scope) {
  const tokens = tokenize(formula);
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (value) => {
    const token = tokens[pos];
    if (!token || token.value !== value) {
      throw new Error(`Expected "${value}" in formula: ${formula}`);
    }
    pos += 1;
    return token;
  };

  function parsePrimary() {
    const token = peek();
    if (!token) throw new Error(`Unexpected end of formula: ${formula}`);
    if (token.type === 'op' && token.value === '-') {
      pos += 1;
      return -parsePrimary();
    }
    if (token.type === 'op' && token.value === '(') {
      eat('(');
      const value = parseSum();
      eat(')');
      return value;
    }
    if (token.type === 'number') {
      pos += 1;
      return token.value;
    }
    if (token.type === 'ident') {
      pos += 1;
      if (!(token.value in scope)) {
        throw new Error(`Unknown identifier "${token.value}" in formula: ${formula}`);
      }
      const value = scope[token.value];
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`Identifier "${token.value}" is not a usable number (got ${JSON.stringify(value)})`);
      }
      return value;
    }
    throw new Error(`Unexpected token "${token.value}" in formula: ${formula}`);
  }

  function parseProduct() {
    let left = parsePrimary();
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = peek().value;
      pos += 1;
      const right = parsePrimary();
      if (op === '/' && right === 0) throw new Error(`Division by zero in formula: ${formula}`);
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseSum() {
    let left = parseProduct();
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = peek().value;
      pos += 1;
      const right = parseProduct();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  const result = parseSum();
  if (pos !== tokens.length) {
    throw new Error(`Trailing tokens in formula: ${formula}`);
  }
  return result;
}

/** Identifiers referenced by a formula, for provenance and freshness tracing. */
export function identifiers(formula) {
  return [...new Set(tokenize(formula).filter((t) => t.type === 'ident').map((t) => t.value))];
}
