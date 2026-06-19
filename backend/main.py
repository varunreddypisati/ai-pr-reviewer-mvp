import os
import re
import requests
import ast
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AI PR Reviewer MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CodeRequest(BaseModel):
    code_type: str
    code: str


class FileItem(BaseModel):
    name: str
    code_type: str
    content: str


class FilesRequest(BaseModel):
    files: list[FileItem]


@app.get("/")
def home():
    return {"message": "Backend is running"}


def analyze_python_ast(code: str):
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return {
            "risk_score": "High",
            "summary": "Python syntax error detected.",
            "missing_edge_cases": ["Fix syntax errors before writing tests."],
            "suggested_tests": "Cannot generate tests until syntax is fixed.",
            "pr_comment": "AI PR Review: This code has syntax errors and should not be merged."
        }

    functions = []
    if_count = 0
    raise_count = 0
    try_count = 0
    loop_count = 0
    return_count = 0

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            arg_names = [arg.arg for arg in node.args.args]
            functions.append({"name": node.name, "args": arg_names})
        elif isinstance(node, ast.If):
            if_count += 1
        elif isinstance(node, ast.Raise):
            raise_count += 1
        elif isinstance(node, ast.Try):
            try_count += 1
        elif isinstance(node, (ast.For, ast.While)):
            loop_count += 1
        elif isinstance(node, ast.Return):
            return_count += 1

    missing_edge_cases = []

    if not functions:
        missing_edge_cases.append("No function found to test.")

    if if_count == 0:
        missing_edge_cases.append("No conditional branches found. Add tests for different input paths.")

    if raise_count == 0 and try_count == 0:
        missing_edge_cases.append("No exception handling found. Add tests for failure scenarios.")

    missing_edge_cases.extend([
        "Add None/null input test.",
        "Add boundary value test.",
        "Add negative value test.",
        "Add invalid data type test."
    ])

    complexity_score = 0
    complexity_score += len(functions) * 10
    complexity_score += if_count * 15
    complexity_score += loop_count * 20
    complexity_score += try_count * 15
    complexity_score += raise_count * 10
    complexity_score += len(missing_edge_cases) * 8

    if complexity_score >= 80:
        risk_score = "High"
    elif complexity_score >= 45:
        risk_score = "Medium"
    else:
        risk_score = "Low"

    if functions:
        func_name = functions[0]["name"]
        args = functions[0]["args"]

        if len(args) >= 2:
            suggested_tests = f"""
import pytest

# AST Analysis
# Function detected: {func_name}
# Arguments detected: {", ".join(args)}
# If conditions detected: {if_count}
# Raise statements detected: {raise_count}
# Loops detected: {loop_count}
# Complexity score: {complexity_score}

def test_{func_name}_valid_input():
    result = {func_name}(100, 50)
    assert result is not None

def test_{func_name}_boundary_value():
    result = {func_name}(100, 100)
    assert result is not None

def test_{func_name}_zero_value():
    result = {func_name}(100, 0)
    assert result is not None

def test_{func_name}_negative_value():
    with pytest.raises(Exception):
        {func_name}(100, -10)

def test_{func_name}_invalid_type():
    with pytest.raises(Exception):
        {func_name}("invalid", None)
"""
        else:
            suggested_tests = f"""
import pytest

# AST Analysis
# Function detected: {func_name}
# Arguments detected: {", ".join(args)}
# Complexity score: {complexity_score}

def test_{func_name}_valid_input():
    result = {func_name}(10)
    assert result is not None

def test_{func_name}_none_input():
    with pytest.raises(Exception):
        {func_name}(None)

def test_{func_name}_invalid_type():
    with pytest.raises(Exception):
        {func_name}("invalid")
"""
    else:
        suggested_tests = """
# No function detected.
# Please wrap the code inside a function to generate meaningful unit tests.

def test_placeholder():
    assert True
"""

    pr_comment = f"""
AI PR Review

Risk Score: {risk_score}
Complexity Score: {complexity_score}

Code structure detected:
- Functions: {len(functions)}
- If conditions: {if_count}
- Exceptions/Raises: {raise_count + try_count}
- Loops: {loop_count}
- Return statements: {return_count}

Potential missing edge cases:
{chr(10).join(["- " + item for item in missing_edge_cases])}

Recommendation:
Add unit tests for valid input, None/null input, boundary values, negative values, invalid types, and failure paths before merging.
"""

    return {
        "risk_score": risk_score,
        "summary": f"Python AST-based analysis completed. Complexity score: {complexity_score}.",
        "missing_edge_cases": missing_edge_cases,
        "suggested_tests": suggested_tests,
        "pr_comment": pr_comment
    }


def analyze_frontend_code(code: str):
    lower_code = code.lower()

    component_found = "function " in lower_code or "const " in lower_code or "=>" in lower_code
    uses_props = "props" in lower_code or ("{" in code and "}" in code)
    has_button = "<button" in lower_code
    has_input = "<input" in lower_code
    has_form = "<form" in lower_code
    has_disabled = "disabled" in lower_code
    has_onclick = "onclick" in lower_code or "onClick" in code
    has_onchange = "onchange" in lower_code or "onChange" in code
    has_conditional = "?" in code or "&&" in code or "!" in code
    has_error_state = "error" in lower_code
    has_loading_state = "loading" in lower_code
    has_null_handling = "null" in lower_code or "undefined" in lower_code

    component_name = "Component"

    if "function " in code:
        try:
            component_name = code.split("function ")[1].split("(")[0].strip()
        except Exception:
            component_name = "Component"
    elif "const " in code:
        try:
            component_name = code.split("const ")[1].split("=")[0].strip()
        except Exception:
            component_name = "Component"

    missing_edge_cases = []

    if not component_found:
        missing_edge_cases.append("No clear React component detected.")

    if uses_props and not has_null_handling:
        missing_edge_cases.append("Missing null/undefined props handling.")

    if has_button and not has_disabled:
        missing_edge_cases.append("Button exists but disabled state is not clearly handled.")

    if has_input and not has_onchange:
        missing_edge_cases.append("Input exists but change handling should be tested.")

    if has_form:
        missing_edge_cases.append("Form submission and validation scenarios should be tested.")

    if has_onclick:
        missing_edge_cases.append("Click interaction should be tested.")

    if has_conditional:
        missing_edge_cases.append("Conditional rendering paths should be tested.")

    if not has_error_state:
        missing_edge_cases.append("Missing error state test.")

    if not has_loading_state:
        missing_edge_cases.append("Missing loading state test.")

    complexity_score = 0
    complexity_score += 10 if component_found else 20
    complexity_score += 10 if uses_props else 0
    complexity_score += 15 if has_button else 0
    complexity_score += 15 if has_input else 0
    complexity_score += 20 if has_form else 0
    complexity_score += 10 if has_disabled else 0
    complexity_score += 15 if has_onclick else 0
    complexity_score += 15 if has_onchange else 0
    complexity_score += 20 if has_conditional else 0
    complexity_score += len(missing_edge_cases) * 8

    if complexity_score >= 80:
        risk_score = "High"
    elif complexity_score >= 45:
        risk_score = "Medium"
    else:
        risk_score = "Low"

    suggested_tests = f"""
import {{ render, screen }} from "@testing-library/react";
import "@testing-library/jest-dom";
import {component_name} from "./{component_name}";

// Frontend Analysis
// Component detected: {component_found}
// Component name: {component_name}
// Uses props: {uses_props}
// Button detected: {has_button}
// Input detected: {has_input}
// Form detected: {has_form}
// Disabled state detected: {has_disabled}
// Click handler detected: {has_onclick}
// Change handler detected: {has_onchange}
// Conditional rendering detected: {has_conditional}
// Error state detected: {has_error_state}
// Loading state detected: {has_loading_state}
// Complexity score: {complexity_score}

test("renders {component_name} correctly", () => {{
  render(<{component_name} email="test@example.com" />);
  expect(screen.getByText(/login/i)).toBeInTheDocument();
}});

test("handles missing email prop", () => {{
  render(<{component_name} email="" />);
  expect(screen.getByText(/login/i)).toBeInTheDocument();
}});

test("handles disabled state when email is missing", () => {{
  render(<{component_name} email="" />);
  expect(screen.getByText(/login/i)).toBeDisabled();
}});

test("handles valid email state", () => {{
  render(<{component_name} email="test@example.com" />);
  expect(screen.getByText(/login/i)).not.toBeDisabled();
}});
"""

    pr_comment = f"""
AI PR Review

Risk Score: {risk_score}
Complexity Score: {complexity_score}

Frontend structure detected:
- Component found: {component_found}
- Component name: {component_name}
- Uses props: {uses_props}
- Button: {has_button}
- Input: {has_input}
- Form: {has_form}
- Disabled state: {has_disabled}
- Click handler: {has_onclick}
- Change handler: {has_onchange}
- Conditional rendering: {has_conditional}
- Error state: {has_error_state}
- Loading state: {has_loading_state}

Potential missing edge cases:
{chr(10).join(["- " + item for item in missing_edge_cases])}

Recommendation:
Add React Testing Library tests for rendering, props, disabled state, interactions, conditional rendering, loading state, and error state before merging.
"""

    return {
        "risk_score": risk_score,
        "summary": f"Frontend rule-based analysis completed. Complexity score: {complexity_score}.",
        "missing_edge_cases": missing_edge_cases,
        "suggested_tests": suggested_tests,
        "pr_comment": pr_comment
    }


@app.post("/analyze")
def analyze_code(request: CodeRequest):
    if request.code_type == "backend":
        return analyze_python_ast(request.code)

    return analyze_frontend_code(request.code)


@app.post("/analyze-files")
def analyze_files(request: FilesRequest):
    file_results = []

    risk_priority = {
        "Low": 1,
        "Medium": 2,
        "High": 3
    }

    highest_risk = "Low"

    for file in request.files:
        if file.code_type == "backend":
            result = analyze_python_ast(file.content)
        else:
            result = analyze_frontend_code(file.content)

        result["file_name"] = file.name
        result["code_type"] = file.code_type

        file_results.append(result)

        if risk_priority.get(result["risk_score"], 0) > risk_priority.get(highest_risk, 0):
            highest_risk = result["risk_score"]

    consolidated_pr_comment = "AI PR Review - Multi File Analysis\n\n"

    for result in file_results:
        consolidated_pr_comment += f"""
File: {result["file_name"]}
Type: {result["code_type"]}
Risk: {result["risk_score"]}
Summary: {result["summary"]}

"""

    return {
        "overall_risk_score": highest_risk,
        "files_analyzed": len(file_results),
        "file_results": file_results,
        "consolidated_pr_comment": consolidated_pr_comment
    }