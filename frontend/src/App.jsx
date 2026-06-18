import { useState } from "react";

const API_BASE_URL = "http://localhost:8000";

function App() {
  const [codeType, setCodeType] = useState("backend");
  const [code, setCode] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // New GitHub PR state
  const [prUrl, setPrUrl] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [postedCommentUrl, setPostedCommentUrl] = useState("");

  const classifyLocalFile = (name) => {
    const lowerName = name.toLowerCase();

    if (
      lowerName.endsWith("package.json") ||
      lowerName.endsWith("package-lock.json") ||
      lowerName.endsWith("requirements.txt") ||
      lowerName.endsWith("pyproject.toml") ||
      lowerName.endsWith("pom.xml") ||
      lowerName.endsWith("build.gradle")
    ) {
      return "dependency";
    }

    if (lowerName.endsWith(".py")) {
      return "backend";
    }

    if (
      lowerName.endsWith(".js") ||
      lowerName.endsWith(".jsx") ||
      lowerName.endsWith(".ts") ||
      lowerName.endsWith(".tsx")
    ) {
      return "frontend";
    }

    return "frontend";
  };

  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const allowedExtensions = [
      ".py",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".json",
      ".txt",
      ".toml",
      ".xml",
      ".gradle",
    ];

    const allowedExactFiles = [
      "package.json",
      "package-lock.json",
      "requirements.txt",
      "pyproject.toml",
      "pom.xml",
      "build.gradle",
    ];

    const validFiles = files.filter((file) => {
      const lowerName = file.name.toLowerCase();

      return (
        allowedExactFiles.includes(lowerName) ||
        allowedExtensions.some((ext) => lowerName.endsWith(ext))
      );
    });

    if (validFiles.length !== files.length) {
      alert(
        "Please upload only supported code/dependency files: .py, .js, .jsx, .ts, .tsx, package.json, requirements.txt, pom.xml, etc."
      );
      return;
    }

    const readers = validFiles.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = (e) => {
          resolve({
            name: file.name,
            content: e.target.result,
          });
        };

        reader.readAsText(file);
      });
    });

    Promise.all(readers).then((filesData) => {
      const filesForBackend = filesData.map((file) => {
        return {
          name: file.name,
          code_type: classifyLocalFile(file.name),
          content: file.content,
        };
      });

      setUploadedFiles(filesForBackend);
      setFileName(filesForBackend.map((file) => file.name).join(", "));
      setPrUrl("");
      setPostedCommentUrl("");

      const combinedCode = filesForBackend
        .map((file) => `# File: ${file.name}\n# Type: ${file.code_type}\n\n${file.content}`)
        .join("\n\n-----------------------------\n\n");

      setCode(combinedCode);
      setResult(null);

      const hasPythonFile = filesForBackend.some((file) => file.code_type === "backend");
      const hasDependencyFile = filesForBackend.some((file) => file.code_type === "dependency");

      if (hasPythonFile) {
        setCodeType("backend");
      } else if (hasDependencyFile) {
        setCodeType("dependency");
      } else {
        setCodeType("frontend");
      }
    });
  };

  const analyzeCode = async () => {
    setLoading(true);
    setResult(null);
    setPostedCommentUrl("");

    try {
      let response;

      if (uploadedFiles.length > 1) {
        response = await fetch(`${API_BASE_URL}/analyze-files`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            files: uploadedFiles,
          }),
        });
      } else {
        response = await fetch(`${API_BASE_URL}/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code_type: codeType,
            code: code,
          }),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        setResult({
          risk_score: "Error",
          summary: data.detail || "Unable to analyze code.",
          missing_edge_cases: [],
          suggested_tests: "No tests generated because analysis failed.",
          pr_comment: data.detail || "Analysis failed.",
        });
      } else {
        setResult(data);
      }
    } catch (error) {
      setResult({
        risk_score: "Error",
        summary: "Backend is not reachable.",
        missing_edge_cases: [],
        suggested_tests: "Please make sure FastAPI is running on localhost:8000.",
        pr_comment: "Could not connect to backend.",
      });
    }

    setLoading(false);
  };

  const analyzePR = async () => {
    setLoading(true);
    setResult(null);
    setUploadedFiles([]);
    setFileName("");
    setCode("");
    setPostedCommentUrl("");

    try {
      const response = await fetch(`${API_BASE_URL}/analyze-pr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pr_url: prUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult({
          overall_risk_score: "Error",
          coverage_readiness: 0,
          files_analyzed: 0,
          file_results: [],
          skipped_files: [],
          consolidated_pr_comment: data.detail || "Could not analyze GitHub PR.",
        });
      } else {
        setResult(data);
      }
    } catch (error) {
      setResult({
        overall_risk_score: "Error",
        coverage_readiness: 0,
        files_analyzed: 0,
        file_results: [],
        skipped_files: [],
        consolidated_pr_comment:
          "Backend is not reachable or GitHub PR analysis failed. Please check FastAPI and GITHUB_TOKEN.",
      });
    }

    setLoading(false);
  };

  const postReviewToGitHub = async () => {
    const comment = result?.consolidated_pr_comment || result?.pr_comment;

    if (!prUrl.trim()) {
      alert("Please paste a GitHub PR URL first.");
      return;
    }

    if (!comment || !comment.trim()) {
      alert("No PR comment found to post.");
      return;
    }

    setPostingComment(true);

    try {
      const response = await fetch(`${API_BASE_URL}/post-comment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pr_url: prUrl,
          comment: comment,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || "Failed to post comment to GitHub.");
      } else {
        setPostedCommentUrl(data.comment_url);
        alert("QuickLance review posted to GitHub PR!");
      }
    } catch (error) {
      alert("Backend is not reachable. Failed to post comment.");
    }

    setPostingComment(false);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text || "");
    alert("Copied!");
  };

  const getRiskBackground = (risk) => {
    if (risk === "High") return "#ffdddd";
    if (risk === "Medium") return "#fff4cc";
    if (risk === "Low") return "#ddffdd";
    if (risk === "Error") return "#eeeeee";
    return "#eeeeee";
  };

  const getRiskBadgeStyle = (risk) => {
    return {
      display: "inline-block",
      padding: "6px 12px",
      borderRadius: "999px",
      background: getRiskBackground(risk),
      border: "1px solid #ddd",
      fontWeight: "bold",
    };
  };

  const isMultiFileResult = result && result.file_results;

  return (
    <div
      style={{
        padding: "30px",
        fontFamily: "Arial",
        maxWidth: "1100px",
        margin: "0 auto",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1>🚀 QuickLance</h1>
        <p>AI PR Reviewer • Risk Detection • Coverage Readiness • Test Suggestions</p>
      </div>

      {/* GitHub PR Analysis Mode */}
      <div
        style={{
          marginTop: "30px",
          border: "1px solid #ddd",
          padding: "20px",
          borderRadius: "12px",
          background: "#fafafa",
        }}
      >
        <h2>Analyze GitHub Pull Request</h2>
        <p style={{ marginTop: "-5px", color: "#555" }}>
          Paste a real GitHub PR URL. QuickLance will fetch changed files, analyze risk, and generate a review comment.
        </p>

        <input
          type="text"
          placeholder="https://github.com/owner/repo/pull/123"
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            fontSize: "14px",
            boxSizing: "border-box",
          }}
        />

        <button
          onClick={analyzePR}
          disabled={loading || !prUrl.trim()}
          style={{
            marginTop: "12px",
            padding: "12px 25px",
            fontSize: "16px",
            cursor: loading || !prUrl.trim() ? "not-allowed" : "pointer",
            borderRadius: "8px",
            border: "none",
          }}
        >
          {loading && prUrl ? "Analyzing PR..." : "Analyze PR"}
        </button>
      </div>

      {/* Manual Upload/Paste Mode */}
      <div
        style={{
          marginTop: "30px",
          border: "1px solid #eee",
          padding: "20px",
          borderRadius: "12px",
        }}
      >
        <h2>Manual Code Analysis Fallback</h2>

        <div style={{ marginTop: "15px" }}>
          <h3>Upload Code File(s)</h3>
          <input
            type="file"
            accept=".py,.js,.jsx,.ts,.tsx,.json,.txt,.toml,.xml,.gradle"
            multiple
            onChange={handleFileUpload}
          />

          {fileName && (
            <p>
              Uploaded file(s): <strong>{fileName}</strong>
            </p>
          )}
        </div>

        <div style={{ marginTop: "25px" }}>
          <h3>Select Code Type</h3>

          <label>
            <input
              type="radio"
              value="backend"
              checked={codeType === "backend"}
              onChange={(e) => setCodeType(e.target.value)}
            />
            Backend
          </label>

          <label style={{ marginLeft: "20px" }}>
            <input
              type="radio"
              value="frontend"
              checked={codeType === "frontend"}
              onChange={(e) => setCodeType(e.target.value)}
            />
            Frontend
          </label>

          <label style={{ marginLeft: "20px" }}>
            <input
              type="radio"
              value="dependency"
              checked={codeType === "dependency"}
              onChange={(e) => setCodeType(e.target.value)}
            />
            Dependency
          </label>
        </div>

        <div style={{ marginTop: "20px" }}>
          <h3>Paste or Review Code</h3>

          <textarea
            rows="14"
            placeholder="Paste your code here or upload files..."
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setUploadedFiles([]);
              setFileName("");
              setPrUrl("");
              setPostedCommentUrl("");
            }}
            style={{
              width: "100%",
              padding: "12px",
              fontFamily: "monospace",
              fontSize: "14px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          onClick={analyzeCode}
          disabled={loading || !code.trim()}
          style={{
            marginTop: "20px",
            padding: "12px 25px",
            fontSize: "16px",
            cursor: loading || !code.trim() ? "not-allowed" : "pointer",
            borderRadius: "8px",
            border: "none",
          }}
        >
          {loading && !prUrl ? "Analyzing..." : "Analyze Manual Code"}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: "30px" }}>
          {isMultiFileResult ? (
            <>
              <div
                style={{
                  padding: "20px",
                  borderRadius: "10px",
                  background: getRiskBackground(result.overall_risk_score),
                  textAlign: "center",
                }}
              >
                <h2>Overall PR Risk</h2>
                <h1>{result.overall_risk_score}</h1>

                {result.repository && (
                  <p>
                    Repository: <strong>{result.repository}</strong> | PR:{" "}
                    <strong>#{result.pull_number}</strong>
                  </p>
                )}

                <p>Files analyzed: {result.files_analyzed}</p>

                <p>
                  Coverage Readiness:{" "}
                  <strong>{result.coverage_readiness ?? 0}%</strong>
                </p>

                {result.changed_files !== undefined && (
                  <p>Total changed files from GitHub: {result.changed_files}</p>
                )}
              </div>

              {result.test_files_detected && result.test_files_detected.length > 0 && (
                <div
                  style={{
                    marginTop: "20px",
                    border: "1px solid #ddd",
                    padding: "15px",
                    borderRadius: "10px",
                    background: "#f7fbff",
                  }}
                >
                  <h3>Test Files Detected</h3>
                  <ul>
                    {result.test_files_detected.map((file, index) => (
                      <li key={index}>{file}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.skipped_files && result.skipped_files.length > 0 && (
                <div
                  style={{
                    marginTop: "20px",
                    border: "1px solid #ddd",
                    padding: "15px",
                    borderRadius: "10px",
                    background: "#fafafa",
                  }}
                >
                  <h3>Skipped Files</h3>
                  <ul>
                    {result.skipped_files.map((file, index) => (
                      <li key={index}>{file}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div
                style={{
                  marginTop: "20px",
                  border: "1px solid #ddd",
                  padding: "15px",
                  borderRadius: "10px",
                }}
              >
                <h2>File-by-File Analysis</h2>

                {result.file_results.map((fileResult, index) => (
                  <div
                    key={index}
                    style={{
                      marginTop: "15px",
                      padding: "15px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                      background: getRiskBackground(fileResult.risk_score),
                    }}
                  >
                    <h3>{fileResult.file_name}</h3>
                    <p>
                      <strong>Type:</strong> {fileResult.code_type}
                    </p>
                    <p>
                      <strong>Risk:</strong>{" "}
                      <span style={getRiskBadgeStyle(fileResult.risk_score)}>
                        {fileResult.risk_score}
                      </span>
                    </p>
                    <p>
                      <strong>Coverage Readiness:</strong>{" "}
                      {fileResult.coverage_readiness ?? 0}%
                    </p>
                    <p>
                      <strong>Summary:</strong> {fileResult.summary}
                    </p>

                    {fileResult.missing_edge_cases &&
                      fileResult.missing_edge_cases.length > 0 && (
                        <>
                          <h4>Missing Edge Cases</h4>
                          <ul>
                            {fileResult.missing_edge_cases.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </>
                      )}

                    <h4>Suggested Tests</h4>
                    <button
                      onClick={() =>
                        copyToClipboard(fileResult.suggested_tests)
                      }
                    >
                      Copy Tests for {fileResult.file_name}
                    </button>

                    <pre
                      style={{
                        marginTop: "10px",
                        textAlign: "left",
                        background: "#f4f4f4",
                        padding: "15px",
                        borderRadius: "8px",
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {fileResult.suggested_tests}
                    </pre>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: "20px",
                  border: "1px solid #ddd",
                  padding: "15px",
                  borderRadius: "10px",
                }}
              >
                <h2>Consolidated PR Comment</h2>

                <button
                  onClick={() =>
                    copyToClipboard(result.consolidated_pr_comment)
                  }
                >
                  Copy Consolidated PR Comment
                </button>

                {prUrl && result?.consolidated_pr_comment && (
                  <div style={{ marginTop: "10px" }}>
                    <button
                      onClick={postReviewToGitHub}
                      disabled={postingComment || result.overall_risk_score === "Error"}
                      style={{
                        padding: "10px 18px",
                        borderRadius: "8px",
                        border: "none",
                        cursor:
                          postingComment || result.overall_risk_score === "Error"
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      {postingComment ? "Posting..." : "Post Review to GitHub PR"}
                    </button>

                    {postedCommentUrl && (
                      <p>
                        ✅ Comment posted:{" "}
                        <a href={postedCommentUrl} target="_blank" rel="noreferrer">
                          Open GitHub Comment
                        </a>
                      </p>
                    )}
                  </div>
                )}

                <pre
                  style={{
                    marginTop: "10px",
                    textAlign: "left",
                    background: "#f4f4f4",
                    padding: "15px",
                    borderRadius: "8px",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {result.consolidated_pr_comment}
                </pre>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  padding: "20px",
                  borderRadius: "10px",
                  background: getRiskBackground(result.risk_score),
                  textAlign: "center",
                }}
              >
                <h2>Risk Score</h2>
                <h1>{result.risk_score}</h1>
                <p>
                  Coverage Readiness:{" "}
                  <strong>{result.coverage_readiness ?? 0}%</strong>
                </p>
              </div>

              <div
                style={{
                  marginTop: "20px",
                  border: "1px solid #ddd",
                  padding: "15px",
                  borderRadius: "10px",
                }}
              >
                <h2>Summary</h2>
                <p>{result.summary}</p>
              </div>

              {result.missing_edge_cases &&
                result.missing_edge_cases.length > 0 && (
                  <div
                    style={{
                      marginTop: "20px",
                      border: "1px solid #ddd",
                      padding: "15px",
                      borderRadius: "10px",
                    }}
                  >
                    <h2>Missing Edge Cases</h2>
                    <ul>
                      {result.missing_edge_cases.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

              <div
                style={{
                  marginTop: "20px",
                  border: "1px solid #ddd",
                  padding: "15px",
                  borderRadius: "10px",
                }}
              >
                <h2>Suggested Tests</h2>

                <button
                  onClick={() => copyToClipboard(result.suggested_tests)}
                >
                  Copy Tests
                </button>

                <pre
                  style={{
                    marginTop: "10px",
                    textAlign: "left",
                    background: "#f4f4f4",
                    padding: "15px",
                    borderRadius: "8px",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {result.suggested_tests}
                </pre>
              </div>

              <div
                style={{
                  marginTop: "20px",
                  border: "1px solid #ddd",
                  padding: "15px",
                  borderRadius: "10px",
                }}
              >
                <h2>PR Comment</h2>

                <button onClick={() => copyToClipboard(result.pr_comment)}>
                  Copy PR Comment
                </button>

                <pre
                  style={{
                    marginTop: "10px",
                    textAlign: "left",
                    background: "#f4f4f4",
                    padding: "15px",
                    borderRadius: "8px",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {result.pr_comment}
                </pre>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;