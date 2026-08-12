import {test} from "node:test";
import {strict as assert} from "node:assert";
import * as Settings from "../../config/Settings";

test("all setting IDs are non-empty strings", () => {
    for (const [key, value] of Object.entries(Settings)) {
        assert.equal(typeof value, "string", `${key} should be a string`);
        assert.ok((value as string).length > 0, `${key} should not be empty`);
    }
});

test("all setting IDs are unique", () => {
    const values = Object.values(Settings);
    const unique = new Set(values);
    assert.equal(
        unique.size,
        values.length,
        "setting IDs must not collide with each other",
    );
});
