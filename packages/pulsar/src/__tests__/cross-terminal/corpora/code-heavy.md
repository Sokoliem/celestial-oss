# Synthetic Corpus: Code-Heavy

This corpus stresses code-block rendering, fence renderers, and syntax
highlighting consistency.

```javascript
const fib = (n) => n < 2 ? n : fib(n - 1) + fib(n - 2);
console.log(fib(10));
```

```json
{
  "name": "pulsar",
  "version": "1.0.0",
  "dependencies": {
    "@celestial/spectrum": "workspace:*"
  }
}
```

```diff
@@ -1,3 +1,3 @@
-const old = 1;
+const updated = 2;
 unchanged
```

```sql
SELECT id, name FROM users WHERE active = true LIMIT 10;
```

```http
GET /api/v1/users HTTP/1.1
Host: example.com
Accept: application/json
```
