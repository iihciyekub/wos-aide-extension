const test = require("node:test");
const assert = require("node:assert/strict");

const { classifyWosHost, isWosLocation } = require("../src/wos-host");

test("recognizes official Web of Science hosts", () => {
  assert.equal(classifyWosHost("www.webofscience.com"), "official");
  assert.equal(classifyWosHost("apps.webofknowledge.com"), "official");
  assert.equal(classifyWosHost("isiknowledge.com"), "official");
});

test("recognizes common institutional proxy hostnames", () => {
  assert.equal(
    classifyWosHost("www-webofscience-com.ezproxy.university.edu"),
    "proxy"
  );
  assert.equal(
    classifyWosHost("webofscience-com.proxy.library.edu"),
    "proxy"
  );
});

test("recognizes generic proxy URLs that carry the WOS target in the path", () => {
  assert.equal(
    classifyWosHost("proxy.library.edu", "https://proxy.library.edu/login?url=https%3A%2F%2Fwww.webofscience.com%2Fwos"),
    "proxy"
  );
});

test("does not classify unrelated sites as WOS", () => {
  assert.equal(classifyWosHost("example.com", "https://example.com/"), "unsupported");
  assert.equal(isWosLocation("example.com"), false);
});
