// A generic loader that does nothing but return success
export async function loader() {
  return Response.json({ ok: true });
}

// A generic UI that just shows text
export default function Portal() {
  return (
    <div style={{ padding: "50px", background: "white", textAlign: "center", border: "5px solid green" }}>
      <h1 style={{ color: "green" }}>IT WORKS!</h1>
      <p>The App Proxy is connected successfully.</p>
    </div>
  );
}