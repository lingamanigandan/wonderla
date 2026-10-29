
const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function apiGet(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(`The API returned an invalid response (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(result.message || `Request failed: ${response.status}`);
  }

  return result;
}

export async function apiPost(path, data) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || `Request failed: ${response.status}`);
  }

  return result;
}
