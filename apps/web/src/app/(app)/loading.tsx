/** Instant feedback while the next page's server data loads. */
export default function Loading() {
  return (
    <main className="page" aria-busy="true" aria-label="Loading">
      <div className="route-bar"><span /></div>
      <div className="skel" style={{ height: 14, width: 120, marginBottom: 14 }} />
      <div className="skel" style={{ height: 34, width: "45%", marginBottom: 10 }} />
      <div className="skel" style={{ height: 14, width: "60%", marginBottom: 26 }} />
      <div className="grid g4" style={{ marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 110 }} />)}
      </div>
      <div className="grid g2">
        <div className="skel" style={{ height: 260 }} />
        <div className="skel" style={{ height: 260 }} />
      </div>
    </main>
  );
}
