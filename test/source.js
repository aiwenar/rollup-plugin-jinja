import { Source, Parser, SyntaxError } from '../lib/parse'

describe('Source', () => {
  describe('symbols parser', () => {
    it('parses one-char symbols', () => {
      let ops = ['!','%','(',')','*','+','-','.','/','<','=','>','{','}']
      let src = new Source(ops.join(' '))

      for (let i = 0 ; i < ops.length ; ++i) {
        let ev = src.next()
        ev.should.deep.eq({
          type: 'Symbol',
          value: ops[i],
          start: { line: 1, column: 2*i, offset: 2*i },
          end:   { line: 1, column: 2*i+1, offset: 2*i+1 },
        })
      }
    })

    it('parses two-char symbols', () => {
      let ops = ['!=','%}','**','<=','==','>=','{%','{{','}}']
      let src = new Source(ops.join(' '))

      for (let i = 0 ; i < ops.length ; ++i) {
        let ev = src.next()
        ev.should.deep.eq({
          type: 'Symbol',
          value: ops[i],
          start: { line: 1, column: 3*i, offset: 3*i },
          end:   { line: 1, column: 3*i+2, offset: 3*i+2 },
        })
      }
    })
  })

  describe('number parser', () => {
    it('parses simple decimals', () => {
      new Source('4857').next().should.deep.eq({
        type: 'Number',
        value: 4857,
        start: { line: 1, column: 0, offset: 0 },
        end:   { line: 1, column: 4, offset: 4 },
      })
    })

    it('parses floating point with implicit fraction', () => {
      new Source('796.').next().should.deep.eq({
        type: 'Number',
        value: 796.,
        start: { line: 1, column: 0, offset: 0 },
        end:   { line: 1, column: 4, offset: 4 },
      })
    })

    it('parses floating point with explicit fraction', () => {
      new Source('53.87').next().should.deep.eq({
        type: 'Number',
        value: 53.87,
        start: { line: 1, column: 0, offset: 0 },
        end:   { line: 1, column: 5, offset: 5 },
      })
    })
  })

  describe('identifier parser', () => {
    it('parses identifiers', () => {
      new Source('identifier').next().should.deep.eq({
        type: 'Identifier',
        value: 'identifier',
        start: { line: 1, column: 0,  offset: 0 },
        end:   { line: 1, column: 10, offset: 10 },
      })
    })
  })

  describe('string parser', () => {
    it('parses " strings', () => {
      new Source('"a \\"string\\"" past').next(true).should.deep.eq({
        type: 'String',
        start: { line: 1, column: 0,  offset: 0 },
        end:   { line: 1, column: 14, offset: 14 },
      })
    })

    it('parses \' strings', () => {
      new Source('\'a \\\'string\\\'\' past').next(true).should.deep.eq({
        type: 'String',
        start: { line: 1, column: 0,  offset: 0 },
        end:   { line: 1, column: 14, offset: 14 },
      })
    })

    it('parses an unterminated string', () => {
      new Source('\'a "string"').next(true).should.deep.eq({
        type: 'String',
        start: { line: 1, column: 0,  offset: 0 },
        end:   { line: 1, column: 12, offset: 12 },
      })
    })
  })
})

const loc = (offset, line, column) => ({ offset, line, column })

const op = (op, offset, line, column) => ({
  type: 'Operator',
  value: op,
  start: loc(offset, line, column),
  end: loc(offset + op.length, line, column + op.length),
})

describe('Parser', () => {
  it('Generates proper empty AST', () => {
    new Parser(new Source('')).generate().should.deep.eq({
      type: 'Template',
      extends: null,
      blocks: [],
      macros: [],
      body: {
        type: 'Scope',
        variables: [],
        body: [],
        start: loc(0, 1, 0),
        end:   loc(0, 1, 0),
      },
      start: loc(0, 1, 0),
      end:   loc(0, 1, 0),
    })
  })

  it('Consumes text until a placeable', () => {
    let source = new Source('text {%')
    let parser = new Parser(source)
    ;(() => {
      parser.process()
    }).should.throw(SyntaxError)
    parser.context.body.should.deep.eq([{
      type: 'Text',
      text: 'text ',
      start: loc(0, 1, 0),
      end:   loc(5, 1, 5),
    }])
    source.eos.should.eq(true)
  })

  describe("Expression parser", () => {
    it("reads variables", () => {
      let source = new Source('variable')
      let parser = new Parser(source)
      parser.expression([]).should.deep.eq({
        type: 'Variable',
        name: 'variable',
        start: loc(0, 1, 0),
        end:   loc(8, 1, 8),
      })
    })

    it("reads function calls", () => {
      let source = new Source('function()')
      let parser = new Parser(source)
      parser.expression([]).should.deep.eq({
        type: 'FunctionCall',
        function: {
          type: 'Variable',
          name: 'function',
          start: loc(0, 1, 0),
          end:   loc(8, 1, 8),
        },
        args: [],
        start: loc(0, 1, 0),
        end:   loc(10, 1, 10),
      })
    })

    it("reads method calls", () => {
      let source = new Source('object.method()')
      let parser = new Parser(source)
      parser.expression([]).should.deep.eq({
        type: 'FunctionCall',
        function: {
          type: 'Member',
          object: {
            type: 'Variable',
            name: 'object',
            start: loc(0, 1, 0),
            end: loc(6, 1, 6),
          },
          property: {
            type: 'Variable',
            name: 'method',
            start: loc(7, 1, 7),
            end: loc(13, 1, 13),
          },
          start: loc(0, 1, 0),
          end: loc(13, 1, 13),
        },
        args: [],
        start: loc(0, 1, 0),
        end: loc(15, 1, 15),
      })
    })

    it("reads function call with arguments", () => {
      let source = new Source('function(variable, 12)')
      let parser = new Parser(source)
      parser.expression([]).should.deep.eq({
        type: 'FunctionCall',
        function: {
          type: 'Variable',
          name: 'function',
          start: loc(0, 1, 0),
          end:   loc(8, 1, 8),
        },
        args: [
          {
            type: 'Variable',
            name: 'variable',
            start: loc(9, 1, 9),
            end:   loc(17, 1, 17),
          },
          {
            type: 'Number',
            value: 12,
            start: loc(19, 1, 19),
            end: loc(21, 1, 21),
          }
        ],
        start: loc(0, 1, 0),
        end: loc(22, 1, 22),
      })
    })

    it("reads binary expressions", () => {
      let source = new Source('v1 + v2')
      let parser = new Parser(source)
      parser.expression([]).should.deep.eq({
        type: 'BinOp',
        op: {
          type: 'Operator',
          value: '+',
          start: loc(3, 1, 3),
          end:   loc(4, 1, 4),
        },
        left: {
          type: 'Variable',
          name: 'v1',
          start: loc(0, 1, 0),
          end:   loc(2, 1, 2),
        },
        right: {
          type: 'Variable',
          name: 'v2',
          start: loc(5, 1, 5),
          end:   loc(7, 1, 7),
        },
        start: loc(0, 1, 0),
        end:   loc(7, 1, 7),
      })
    })

    it("reads unary expressions", () => {
      let source = new Source('not id, -1')
      let parser = new Parser(source)
      parser.expression([',']).should.deep.eq({
        type: 'UnOp',
        op: {
          type: 'Operator',
          value: 'not',
          start: loc(0, 1, 0),
          end: loc(3, 1, 3),
        },
        argument: {
          type: 'Variable',
          name: 'id',
          start: loc(4, 1, 4),
          end: loc(6, 1, 6),
        },
        start: loc(0, 1, 0),
        end: loc(6, 1, 6),
      })
      parser.next().should.deep.eq({
        type: 'Symbol',
        value: ',',
        start: loc(6, 1, 6),
        end: loc(7, 1, 7),
      })
      parser.expression([',']).should.deep.eq({
        type: 'UnOp',
        op: {
          type: 'Operator',
          value: '-',
          start: loc(8, 1, 8),
          end: loc(9, 1, 9),
        },
        argument: {
          type: 'Number',
          value: 1,
          start: loc(9, 1, 9),
          end: loc(10, 1, 10),
        },
        start: loc(8, 1, 8),
        end: loc(10, 1, 10),
      })
    })

    it("reads filter expressions", () => {
      let source = new Source('v1 | f1 | f2(v2)')
      let parser = new Parser(source)
      parser.expression([]).should.deep.eq({
        type: 'Filter',
        filter: {
          type: 'FunctionCall',
          function: {
            type: 'Variable',
            name: 'f2',
            start: loc(10, 1, 10),
            end: loc(12, 1, 12),
          },
          args: [{
            type: 'Variable',
            name: 'v2',
            start: loc(13, 1, 13),
            end: loc(15, 1, 15),
          }],
          start: loc(10, 1, 10),
          end: loc(16, 1, 16),
        },
        value: {
          type: 'Filter',
          filter: {
            type: 'Variable',
            name: 'f1',
            start: loc(5, 1, 5),
            end: loc(7, 1, 7),
          },
          value: {
            type: 'Variable',
            name: 'v1',
            start: loc(0, 1, 0),
            end: loc(2, 1, 2),
          },
          start: loc(0, 1, 0),
          end: loc(7, 1, 7),
        },
        start: loc(0, 1, 0),
        end: loc(16, 1, 16),
      })
    })

    it("respects operator precedence", () => {
      let source = new Source('v1 + v2 * v3 / (v4.v5 - v6) | f')
      let parser = new Parser(source)
      parser.expression([]).should.deep.eq({
        type: 'Filter',
        filter: {
          type: 'Variable',
          name: 'f',
          start: loc(30, 1, 30),
          end: loc(31, 1, 31),
        },
        value: {
          type: 'BinOp',
          op: op('+', 3, 1, 3),
          left: {
            type: 'Variable',
            name: 'v1',
            start: loc(0, 1, 0),
            end: loc(2, 1, 2),
          },
          right: {
            type: 'BinOp',
            op: op('/', 13, 1, 13),
            start: loc(10, 1, 10),
            left: {
              type: 'BinOp',
              op: op('*', 8, 1, 8),
              left: {
                type: 'Variable',
                name: 'v2',
                start: loc(5, 1, 5),
                end: loc(7, 1, 7),
              },
              right: {
                type: 'Variable',
                name: 'v3',
                start: loc(10, 1, 10),
                end: loc(12, 1, 12),
              },
              start: loc(5, 1, 5),
              end: loc(12, 1, 12),
            },
            right: {
              type: 'BinOp',
              op: op('-', 22, 1, 22),
              left: {
                type: 'Member',
                object: {
                  type: 'Variable',
                  name: 'v4',
                  start: loc(16, 1, 16),
                  end: loc(18, 1, 18),
                },
                property: {
                  type: 'Variable',
                  name: 'v5',
                  start: loc(19, 1, 19),
                  end: loc(21, 1, 21),
                },
                start: loc(16, 1, 16),
                end: loc(21, 1, 21),
              },
              right: {
                type: 'Variable',
                name: 'v6',
                start: loc(24, 1, 24),
                end: loc(26, 1, 26),
              },
              start: loc(16, 1, 16),
              end: loc(26, 1, 26),
            },
            start: loc(5, 1, 5),
            end: loc(26, 1, 26),
          },
          start: loc(0, 1, 0),
          end: loc(26, 1, 26),
        },
        start: loc(0, 1, 0),
        end: loc(31, 1, 31),
      })
    })
  })

  it("parses a placeable with no filters", () => {
    let source = new Source("{{ var + 2 }}")
    let parser = new Parser(source)
    parser.process()
    parser.context.body.should.deep.eq([{
      type: 'PutValue',
      value: {
        type: 'BinOp',
        op: op('+', 7, 1, 7),
        left: {
          type: 'Variable',
          name: 'var',
          start: loc(3, 1, 3),
          end: loc(6, 1, 6),
        },
        right: {
          type: 'Number',
          value: 2,
          start: loc(9, 1, 9),
          end: loc(10, 1, 10),
        },
        start: loc(3, 1, 3),
        end: loc(10, 1, 10),
      },
      filters: [],
      start: loc(0, 1, 0),
      end: loc(13, 1, 13),
    }])
  })

  it("parses a placeable with filters", () => {
    let source = new Source('{{ var | f1() | f2 }}')
    let parser = new Parser(source)
    parser.process()
    parser.context.body.should.deep.eq([{
      type: 'PutValue',
      value: {
        type: 'Variable',
        name: 'var',
        start: loc(3, 1, 3),
        end: loc(6, 1, 6),
      },
      filters: [
        {
          type: 'FunctionCall',
          function: {
            type: 'Variable',
            name: 'f1',
            start: loc(9, 1, 9),
            end: loc(11, 1, 11),
          },
          args: [],
          start: loc(9, 1, 9),
          end: loc(13, 1, 13),
        },
        {
          type: 'Variable',
          name: 'f2',
          start: loc(16, 1, 16),
          end: loc(18, 1, 18),
        }
      ],
      start: loc(0, 1, 0),
      end: loc(21, 1, 21),
    }])
  })

  describe("If expressions", () => {
    it("parses simple if-without-else statement", () => {
      let source = new Source('{% if var %}then{% endif %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([{
        type: 'CaseStatement',
        arms: [
          {
            type: 'Arm',
            condition: {
              type: 'Variable',
              name: 'var',
              start: loc(6, 1, 6),
              end: loc(9, 1, 9),
            },
            body: [{
              type: 'Text',
              text: 'then',
              start: loc(12, 1, 12),
              end: loc(16, 1, 16),
            }],
            start: loc(0, 1, 0),
            end: loc(24, 1, 24),
          }
        ],
        start: loc(0, 1, 0),
        end: loc(24, 1, 24),
      }])
    })

    it("parses an if-else statement", () => {
      let source = new Source('{% if var %}then{% else %}else{% endif %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([{
        type: 'CaseStatement',
        arms: [
          {
            type: 'Arm',
            condition: {
              type: 'Variable',
              name: 'var',
              start: loc(6, 1, 6),
              end: loc(9, 1, 9),
            },
            body: [{
              type: 'Text',
              text: 'then',
              start: loc(12, 1, 12),
              end: loc(16, 1, 16),
            }],
            start: loc(0, 1, 0),
            end: loc(23, 1, 23),
          },
          {
            type: 'Arm',
            condition: {
              type: 'Boolean',
              value: true,
              start: loc(16, 1, 16),
              end: loc(16, 1, 16),
            },
            body: [{
              type: 'Text',
              text: 'else',
              start: loc(26, 1, 26),
              end: loc(30, 1, 30),
            }],
            start: loc(16, 1, 16),
            end: loc(38, 1, 38),
          }
        ],
        start: loc(0, 1, 0),
        end: loc(38, 1, 38),
      }])
    })

    it("Parses an if-elif statement", () => {
      let source = new Source('{% if v1 %}then{% elif v2 %}elif{% endif %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([{
        type: 'CaseStatement',
        arms: [
          {
            type: 'Arm',
            condition: {
              type: 'Variable',
              name: 'v1',
              start: loc(6, 1, 6),
              end: loc(8, 1, 8),
            },
            body: [{
              type: 'Text',
              text: 'then',
              start: loc(11, 1, 11),
              end: loc(15, 1, 15),
            }],
            start: loc(0, 1, 0),
            end: loc(22, 1, 22),
          },
          {
            type: 'Arm',
            condition: {
              type: 'Variable',
              name: 'v2',
              start: loc(23, 1, 23),
              end: loc(25, 1, 25),
            },
            body: [{
              type: 'Text',
              text: 'elif',
              start: loc(28, 1, 28),
              end: loc(32, 1, 32),
            }],
            start: loc(15, 1, 15),
            end: loc(40, 1, 40),
          }
        ],
        start: loc(0, 1, 0),
        end: loc(40, 1, 40),
      }])
    })

    it("Parses an if-elif-else statement", () => {
      let source = new Source('{% if v1 %}then{% elif v2 %}elif{% else %}else{% endif %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([{
        type: 'CaseStatement',
        arms: [
          {
            type: 'Arm',
            condition: {
              type: 'Variable',
              name: 'v1',
              start: loc(6, 1, 6),
              end: loc(8, 1, 8),
            },
            body: [{
              type: 'Text',
              text: 'then',
              start: loc(11, 1, 11),
              end: loc(15, 1, 15),
            }],
            start: loc(0, 1, 0),
            end: loc(22, 1, 22),
          },
          {
            type: 'Arm',
            condition: {
              type: 'Variable',
              name: 'v2',
              start: loc(23, 1, 23),
              end: loc(25, 1, 25),
            },
            body: [{
              type: 'Text',
              text: 'elif',
              start: loc(28, 1, 28),
              end: loc(32, 1, 32),
            }],
            start: loc(15, 1, 15),
            end: loc(39, 1, 39),
          },
          {
            type: 'Arm',
            condition: {
              type: 'Boolean',
              value: true,
              start: loc(32, 1, 32),
              end: loc(32, 1, 32),
            },
            body: [{
              type: 'Text',
              text: 'else',
              start: loc(42, 1, 42),
              end: loc(46, 1, 46),
            }],
            start: loc(32, 1, 32),
            end: loc(54, 1, 54),
          }
        ],
        start: loc(0, 1, 0),
        end: loc(54, 1, 54),
      }])
    })
  })

  describe("For loops", () => {
    it("parses a simple for-loop", () => {
      let source = new Source('{% for item in iterable %}body{% endfor %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([{
        type: 'ForLoop',
        pattern: {
          type: 'Variable',
          name: 'item',
          start: loc(7, 1, 7),
          end: loc(11, 1, 11),
        },
        iterable: {
          type: 'Variable',
          name: 'iterable',
          start: loc(15, 1, 15),
          end: loc(23, 1, 23),
        },
        filter: null,
        body: {
          type: 'Scope',
          variables: [],
          body: [{
            type: 'Text',
            text: 'body',
            start: loc(26, 1, 26),
            end: loc(30, 1, 30),
          }],
          start: loc(26, 1, 26),
          end: loc(30, 1, 30),
        },
        alternative: null,
        start: loc(0, 1, 0),
        end: loc(39, 1, 39),
      }])
    })

    it("parses a for loop with a pattern and iterable expression", () => {
      let source = new Source('{% for key, value in dict.items() %}body{% endfor %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([{
        type: 'ForLoop',
        pattern: {
          type: 'Unpack',
          names: [
            {
              type: 'Variable',
              name: 'key',
              start: loc(7, 1, 7),
              end: loc(10, 1, 10),
            },
            {
              type: 'Variable',
              name: 'value',
              start: loc(12, 1, 12),
              end: loc(17, 1, 17),
            }
          ],
          start: loc(7, 1, 7),
          end: loc(17, 1, 17),
        },
        iterable: {
          type: 'FunctionCall',
          function: {
            type: 'Member',
            object: {
              type: 'Variable',
              name: 'dict',
              start: loc(21, 1, 21),
              end: loc(25, 1, 25),
            },
            property: {
              type: 'Variable',
              name: 'items',
              start: loc(26, 1, 26),
              end: loc(31, 1, 31),
            },
            start: loc(21, 1, 21),
            end: loc(31, 1, 31),
          },
          args: [],
          start: loc(21, 1, 21),
          end: loc(33, 1, 33),
        },
        filter: null,
        body: {
          type: 'Scope',
          variables: [],
          body: [{
            type: 'Text',
            text: 'body',
            start: loc(36, 1, 36),
            end: loc(40, 1, 40),
          }],
          start: loc(36, 1, 36),
          end: loc(40, 1, 40),
        },
        alternative: null,
        start: loc(0, 1, 0),
        end: loc(49, 1, 49),
      }])
    })

    it("parses a for loop with an else clause", () => {
      let source = new Source('{% for item in source %}body{% else %}else{% endfor %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([{
        type: 'ForLoop',
        pattern: {
          type: 'Variable',
          name: 'item',
          start: loc(7, 1, 7),
          end: loc(11, 1, 11),
        },
        iterable: {
          type: 'Variable',
          name: 'source',
          start: loc(15, 1, 15),
          end: loc(21, 1, 21),
        },
        body: {
          type: 'Scope',
          variables: [],
          body: [{
            type: 'Text',
            text: 'body',
            start: loc(24, 1, 24),
            end: loc(28, 1, 28),
          }],
          start: loc(24, 1, 24),
          end: loc(28, 1, 28),
        },
        filter: null,
        alternative: [{
          type: 'Text',
          text: 'else',
          start: loc(38, 1, 38),
          end: loc(42, 1, 42),
        }],
        start: loc(0, 1, 0),
        end: loc(51, 1, 51),
      }])
    })

    it("parses a for loop with a filter", () => {
      let source = new Source('{% for item in source if filter(item) %}body{% endfor %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([{
        type: 'ForLoop',
        pattern: {
          type: 'Variable',
          name: 'item',
          start: loc(7, 1, 7),
          end: loc(11, 1, 11),
        },
        iterable: {
          type: 'Variable',
          name: 'source',
          start: loc(15, 1, 15),
          end: loc(21, 1, 21),
        },
        filter: {
          type: 'FunctionCall',
          function: {
            type: 'Variable',
            name: 'filter',
            start: loc(25, 1, 25),
            end: loc(31, 1, 31),
          },
          args: [{
            type: 'Variable',
            name: 'item',
            start: loc(32, 1, 32),
            end: loc(36, 1, 36),
          }],
          start: loc(25, 1, 25),
          end: loc(37, 1, 37),
        },
        body: {
          type: 'Scope',
          variables: [],
          body: [{
            type: 'Text',
            text: 'body',
            start: loc(40, 1, 40),
            end: loc(44, 1, 44),
          }],
          start: loc(40, 1, 40),
          end: loc(44, 1, 44),
        },
        alternative: null,
        start: loc(0, 1, 0),
        end: loc(53, 1, 53),
      }])
    })
  })

  describe("Macros", () => {
    it("parses simple macros", () => {
      let source = new Source('{% macro name(a1, a2) %}body{% endmacro %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([])
      parser.macros.should.deep.eq({
        'name': {
          type: 'Macro',
          name: {
            type: 'Identifier',
            value: 'name',
            start: loc(9, 1, 9),
            end: loc(13, 1, 13),
          },
          args: [
            {
              type: 'Argument',
              name: {
                type: 'Identifier',
                value: 'a1',
                start: loc(14, 1, 14),
                end: loc(16, 1, 16),
              },
              default: null,
              start: loc(14, 1, 14),
              end: loc(16, 1, 16),
            },
            {
              type: 'Argument',
              name: {
                type: 'Identifier',
                value: 'a2',
                start: loc(18, 1, 18),
                end: loc(20, 1, 20),
              },
              default: null,
              start: loc(18, 1, 18),
              end: loc(20, 1, 20),
            }
          ],
          body: {
            type: 'Scope',
            variables: [],
            body: [{
              type: 'Text',
              text: 'body',
              start: loc(24, 1, 24),
              end: loc(28, 1, 28),
            }],
            start: loc(24, 1, 24),
            end: loc(28, 1, 28),
          },
          start: loc(0, 1, 0),
          end: loc(39, 1, 39),
        }
      })
    })

    it("parses macros with default arguments", () => {
      let source = new Source('{% macro name(a1, a2=10) %}body{% endmacro %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([])
      parser.macros.should.deep.eq({
        'name': {
          type: 'Macro',
          name: {
            type: 'Identifier',
            value: 'name',
            start: loc(9, 1, 9),
            end: loc(13, 1, 13),
          },
          args: [
            {
              type: 'Argument',
              name: {
                type: 'Identifier',
                value: 'a1',
                start: loc(14, 1, 14),
                end: loc(16, 1, 16),
              },
              default: null,
              start: loc(14, 1, 14),
              end: loc(16, 1, 16),
            },
            {
              type: 'Argument',
              name: {
                type: 'Identifier',
                value: 'a2',
                start: loc(18, 1, 18),
                end: loc(20, 1, 20),
              },
              default: {
                type: 'Number',
                value: 10,
                start: loc(21, 1, 21),
                end: loc(23, 1, 23),
              },
              start: loc(18, 1, 18),
              end: loc(23, 1, 23),
            }
          ],
          body: {
            type: 'Scope',
            variables: [],
            body: [{
              type: 'Text',
              text: 'body',
              start: loc(27, 1, 27),
              end: loc(31, 1, 31),
            }],
            start: loc(27, 1, 27),
            end: loc(31, 1, 31),
          },
          start: loc(0, 1, 0),
          end: loc(42, 1, 42),
        }
      })
    })

    it("parses a macro call", () => {
      let source = new Source('{% call macro(12, arg) %}body{% endcall %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([{
        type: 'MacroCall',
        macro: {
          type: 'Identifier',
          value: 'macro',
          start: loc(8, 1, 8),
          end: loc(13, 1, 13),
        },
        args: [
          {
            type: 'Number',
            value: 12,
            start: loc(14, 1, 14),
            end: loc(16, 1, 16),
          },
          {
            type: 'Variable',
            name: 'arg',
            start: loc(18, 1, 18),
            end: loc(21, 1, 21),
          }
        ],
        body: {
          type: 'Scope',
          variables: [],
          body: [{
            type: 'Text',
            text: 'body',
            start: loc(25, 1, 25),
            end: loc(29, 1, 29),
          }],
          start: loc(25, 1, 25),
          end: loc(29, 1, 29),
        },
        start: loc(0, 1, 0),
        end: loc(39, 1, 39),
      }])
    })

    it("parses macro with no arguments", () => {
      let source = new Source('{% macro name() %}body{% endmacro %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([])
      parser.macros.should.deep.eq({
        'name': {
          type: 'Macro',
          name: {
            type: 'Identifier',
            value: 'name',
            start: loc(9, 1, 9),
            end: loc(13, 1, 13),
          },
          args: [],
          body: {
            type: 'Scope',
            variables: [],
            body: [{
              type: 'Text',
              text: 'body',
              start: loc(18, 1, 18),
              end: loc(22, 1, 22),
            }],
            start: loc(18, 1, 18),
            end: loc(22, 1, 22),
          },
          start: loc(0, 1, 0),
          end: loc(33, 1, 33),
        }
      })
    })
  })

  it("parses filter blocks", () => {
    let source = new Source('{% filter fun(param) %}body{% endfilter %}')
    let parser = new Parser(source)
    parser.process()
    parser.context.body.should.deep.eq([{
      type: 'Filter',
      filter: {
        type: 'FunctionCall',
        function: {
          type: 'Variable',
          name: 'fun',
          start: loc(10, 1, 10),
          end: loc(13, 1, 13),
        },
        args: [{
          type: 'Variable',
          name: 'param',
          start: loc(14, 1, 14),
          end: loc(19, 1, 19),
        }],
        start: loc(10, 1, 10),
        end: loc(20, 1, 20),
      },
      body: {
        type: 'Scope',
        variables: [],
        body: [{
          type: 'Text',
          text: 'body',
          start: loc(23, 1, 23),
          end: loc(27, 1, 27),
        }],
        start: loc(23, 1, 23),
        end: loc(27, 1, 27),
      },
      start: loc(0, 1, 0),
      end: loc(39, 1, 39),
    }])
  })

  describe("Variable assignment", () => {
    it("parses simple assignment", () => {
      let source = new Source('{% set name = value %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([{
        type: 'Assign',
        pattern: {
          type: 'Variable',
          name: 'name',
          start: loc(7, 1, 7),
          end: loc(11, 1, 11),
        },
        value: {
          type: 'Variable',
          name: 'value',
          start: loc(14, 1, 14),
          end: loc(19, 1, 19),
        },
        start: loc(0, 1, 0),
        end: loc(22, 1, 22),
      }])
    })

    it("parses pattern assignment", () => {
      let source = new Source('{% set n1, n2 = get(values) %}')
      let parser = new Parser(source)
      parser.process()
      parser.context.body.should.deep.eq([{
        type: 'Assign',
        pattern: {
          type: 'Unpack',
          names: [
            {
              type: 'Variable',
              name: 'n1',
              start: loc(7, 1, 7),
              end: loc(9, 1, 9),
            },
            {
              type: 'Variable',
              name: 'n2',
              start: loc(11, 1, 11),
              end: loc(13, 1, 13),
            }
          ],
          start: loc(7, 1, 7),
          end: loc(13, 1, 13),
        },
        value: {
          type: 'FunctionCall',
          function: {
            type: 'Variable',
            name: 'get',
            start: loc(16, 1, 16),
            end: loc(19, 1, 19),
          },
          args: [{
            type: 'Variable',
            name: 'values',
            start: loc(20, 1, 20),
            end: loc(26, 1, 26),
          }],
          start: loc(16, 1, 16),
          end: loc(27, 1, 27),
        },
        start: loc(0, 1, 0),
        end: loc(30, 1, 30),
      }])
    })
  })

  it("parses blocks", () => {
    let source = new Source('{% block name %}body{% endblock %}')
    let parser = new Parser(source)
    parser.process()
    parser.context.body.should.deep.eq([{
      type: 'CallBlock',
      name: {
        type: 'Identifier',
        value: 'name',
        start: loc(9, 1, 9),
        end: loc(13, 1, 13),
      },
      start: loc(0, 1, 0),
      end: loc(34, 1, 34),
    }])
    parser.blocks.should.deep.eq({
      'name': {
        type: 'Block',
        name: {
          type: 'Identifier',
          value: 'name',
          start: loc(9, 1, 9),
          end: loc(13, 1, 13),
        },
        body: {
          type: 'Scope',
          variables: [],
          body: [{
            type: 'Text',
            text: 'body',
            start: loc(16, 1, 16),
            end: loc(20, 1, 20),
          }],
          start: loc(16, 1, 16),
          end: loc(20, 1, 20),
        },
        start: loc(0, 1, 0),
        end: loc(34, 1, 34),
      }
    })
  })
})
