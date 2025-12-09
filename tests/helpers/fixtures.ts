import { mkdirSync, writeFileSync, symlinkSync, readFileSync, rmSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

export interface TempRepo {
    root: string;
    cleanup: () => void;
}

export function createTempRepo(): TempRepo {
    const root = join(tmpdir(), `north-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(root, { recursive: true });

    return {
        root,
        cleanup: () => {
            if (existsSync(root)) {
                rmSync(root, { recursive: true, force: true });
            }
        },
    };
}

export function createFile(repoRoot: string, relativePath: string, content: string): void {
    const fullPath = join(repoRoot, relativePath);
    const dir = join(fullPath, "..");
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fullPath, content, "utf-8");
}

export function createSymlink(repoRoot: string, target: string, linkPath: string): void {
    const fullLinkPath = join(repoRoot, linkPath);
    const dir = join(fullLinkPath, "..");
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    symlinkSync(target, fullLinkPath);
}

export function writeGitignore(repoRoot: string, patterns: string[]): void {
    writeFileSync(join(repoRoot, ".gitignore"), patterns.join("\n"), "utf-8");
}

export function readFixtureFile(repoRoot: string, relativePath: string): string {
    return readFileSync(join(repoRoot, relativePath), "utf-8");
}

export function assertNoTempFiles(repoRoot: string): void {
    const entries = readdirSync(repoRoot, { recursive: true });
    const tempFiles = entries.filter((e) => String(e).includes("north-edit-"));
    if (tempFiles.length > 0) {
        throw new Error(`Found temp files: ${tempFiles.join(", ")}`);
    }
}

export function createTypescriptFixture(repoRoot: string, path: string): void {
    const content = `import { foo } from "./utils";
import type { Bar } from "./types";

export interface TestInterface {
    id: number;
    name: string;
}

export type TestType = {
    value: string;
};

export enum TestEnum {
    First = "FIRST",
    Second = "SECOND",
}

export class TestClass {
    private value: number;

    constructor(value: number) {
        this.value = value;
    }

    public getValue(): number {
        return this.value;
    }

    private helper(): void {
        console.log("helper");
    }
}

export function testFunction(arg: string): boolean {
    return arg.length > 0;
}

export async function asyncFunction(): Promise<void> {
    await Promise.resolve();
}

const arrowFunction = (x: number) => x * 2;

export default function defaultExport() {
    return "default";
}
`;
    createFile(repoRoot, path, content);
}

export function createPythonFixture(repoRoot: string, path: string): void {
    const content = `import os
import sys
from typing import List, Dict

def standalone_function(arg: str) -> bool:
    return len(arg) > 0

def another_function():
    pass

class TestClass:
    def __init__(self, value: int):
        self.value = value
    
    def public_method(self) -> int:
        return self.value
    
    def _private_method(self):
        print("private")
    
    @staticmethod
    def static_method():
        return "static"

class AnotherClass:
    pass

async def async_function():
    await asyncio.sleep(1)
`;
    createFile(repoRoot, path, content);
}

export function createGitRepo(repoRoot: string): void {
    spawnSync("git", ["init"], { cwd: repoRoot });
    spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: repoRoot });
    spawnSync("git", ["config", "user.name", "Test User"], { cwd: repoRoot });
}

export function createGitCommit(repoRoot: string, files: string[], message: string): void {
    for (const file of files) {
        spawnSync("git", ["add", file], { cwd: repoRoot });
    }
    spawnSync("git", ["commit", "-m", message], { cwd: repoRoot });
}

export function createFileWithTrailingNewline(repoRoot: string, path: string, content: string): void {
    if (!content.endsWith("\n")) {
        content = content + "\n";
    }
    createFile(repoRoot, path, content);
}

export function createFileWithoutTrailingNewline(repoRoot: string, path: string, content: string): void {
    if (content.endsWith("\n")) {
        content = content.slice(0, -1);
    }
    createFile(repoRoot, path, content);
}

export function createFileWithCRLF(repoRoot: string, path: string, content: string): void {
    const crlfContent = content.replace(/\n/g, "\r\n");
    createFile(repoRoot, path, crlfContent);
}

export function createFileWithUTF8(repoRoot: string, path: string): void {
    const content = `// UTF-8 content
const greeting = "Hello, 世界! 🌍";
const emoji = "🚀 ✨ 🎉";
const accents = "café, naïve, résumé";
`;
    createFile(repoRoot, path, content);
}

export function createEmptyFile(repoRoot: string, path: string): void {
    createFile(repoRoot, path, "");
}

export function createLongLineFile(repoRoot: string, path: string): void {
    const longLine = "x".repeat(1000);
    const content = `short line
${longLine}
another short line
`;
    createFile(repoRoot, path, content);
}

export function createDeepNestedFile(repoRoot: string, depth: number): string {
    const parts = Array.from({ length: depth }, (_, i) => `level${i}`);
    const relativePath = join(...parts, "deep.txt");
    createFile(repoRoot, relativePath, "deep content");
    return relativePath;
}

export function createJavaScriptFixture(repoRoot: string, path: string): void {
    const content = `const util = require('./util');

function normalFunction(arg) {
    return arg * 2;
}

async function asyncFunction() {
    await Promise.resolve();
}

const arrowFunc = (x) => x + 1;

class MyClass {
    constructor(value) {
        this.value = value;
    }

    method() {
        return this.value;
    }
}

module.exports = { normalFunction, MyClass };
`;
    createFile(repoRoot, path, content);
}

export function createRustFixture(repoRoot: string, path: string): void {
    const content = `use std::collections::HashMap;

pub struct TestStruct {
    value: i32,
}

impl TestStruct {
    pub fn new(value: i32) -> Self {
        Self { value }
    }

    pub fn get_value(&self) -> i32 {
        self.value
    }
}

pub fn test_function(arg: &str) -> bool {
    !arg.is_empty()
}

fn private_function() {
    println!("private");
}
`;
    createFile(repoRoot, path, content);
}

export function createGoFixture(repoRoot: string, path: string): void {
    const content = `package main

import "fmt"

type TestStruct struct {
    Value int
}

func (t *TestStruct) GetValue() int {
    return t.Value
}

func TestFunction(arg string) bool {
    return len(arg) > 0
}

func main() {
    fmt.Println("Hello")
}
`;
    createFile(repoRoot, path, content);
}

export function createJavaFixture(repoRoot: string, path: string): void {
    const content = `package com.example;

import java.util.List;

public class TestClass {
    private int value;

    public TestClass(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }

    private void privateMethod() {
        System.out.println("private");
    }
}

interface TestInterface {
    void doSomething();
}
`;
    createFile(repoRoot, path, content);
}

