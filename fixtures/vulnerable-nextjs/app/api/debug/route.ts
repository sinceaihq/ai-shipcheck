export async function GET() {
  return Response.json({
    env: process.env,
    uptime: process.uptime(),
  });
}
