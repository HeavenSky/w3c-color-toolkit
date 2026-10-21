/**
 * 规范支持矩阵的本地化与行结构。
 *
 * `l10n.t` 打桩为只做占位符替换的恒等函数, 因此渲染结果就是英语默认文案。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
	l10n: {
		t: (text: string, ...args: (string | number)[]) =>
			text.replace(/\{(\d+)\}/g, (_, index: string) => String(args[Number(index)])),
	},
}));

import type { RuntimeConfiguration } from "../../src/configuration/load.js";
import { RUNTIME_STRINGS } from "../../src/l10n/runtime-strings.js";

type Render = (typeof import("../../src/commands/support-matrix.js"))["renderSupportMatrix"];

let renderSupportMatrix: Render;

beforeAll(async () => {
	({ renderSupportMatrix } = await import("../../src/commands/support-matrix.js"));
});

const config = {
	cssColor6: true,
	cssColorHdr: false,
	contextualPreview: "light",
	gamutMapping: "css",
	hdrToneMapping: "reinhard",
} as unknown as RuntimeConfiguration;

const EXPECTED_STATES = [..."RRRRRRRRRRRRRRRRCRCCCCCEEEEEEC".split(""), "-"];

function tableRows(markdown: string): string[][] {
	return markdown
		.split("\n")
		.filter(line => line.startsWith("| ") && !line.startsWith("| ---"))
		.slice(1)
		.map(line => line.slice(2, -2).split(" | "));
}

describe("规范支持矩阵", () => {
	it("默认文案为英语, 不含中文", () => {
		const markdown = renderSupportMatrix(config);
		expect(markdown).toContain("# W3C Color Toolkit — Specification Support Matrix");
		expect(markdown).toContain("- CSS Color 6 experimental flag: enabled");
		expect(markdown).toContain("- CSS Color HDR experimental flag: disabled");
		expect(markdown).not.toMatch(/[一-鿿]/u);
		expect(markdown).not.toMatch(/\{\d+\}/u);
	});

	it("行数、顺序与状态不变", () => {
		const rows = tableRows(renderSupportMatrix(config));
		expect(rows.map(row => row[1])).toEqual(EXPECTED_STATES);
		expect(rows[0]![0]).toMatch(/^\d+ `<named-color>` keywords and `transparent`$/u);
	});

	it("矩阵文案全部有中文译文", () => {
		const bundle = JSON.parse(
			readFileSync(
				join(import.meta.dirname, "..", "..", "l10n/bundle.l10n.zh-cn.json"),
				"utf8"
			)
		) as Record<string, string>;
		const keys = Object.keys(RUNTIME_STRINGS).filter(key => key.startsWith("matrix."));
		expect(keys.length).toBeGreaterThan(0);
		for (const key of keys) {
			expect(bundle[RUNTIME_STRINGS[key as keyof typeof RUNTIME_STRINGS]], key).toBeTruthy();
		}
	});
});
