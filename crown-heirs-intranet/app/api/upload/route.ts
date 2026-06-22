import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { isCategory } from "@/lib/documents";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// Document uploads go straight from the browser to Vercel Blob (client upload),
// which avoids the ~4.5 MB serverless request-body limit that broke large PDFs.
// This route only mints a short-lived upload token after checking admin + inputs.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Authorize the upload here — runs before any token is issued.
        const session = await auth();
        if (!isAdmin(session?.user?.email)) {
          throw new Error("Only admins can upload documents.");
        }
        let category = "general";
        try {
          if (clientPayload) category = JSON.parse(clientPayload).category ?? "general";
        } catch {
          // fall back to general
        }
        if (!isCategory(category)) throw new Error("Unknown category.");
        if (!pathname.startsWith(`documents/${category}/`)) {
          throw new Error("Invalid upload path.");
        }
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_BYTES,
          allowedContentTypes: [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain",
            "text/markdown",
            "image/png",
            "image/jpeg",
            "video/mp4",
          ],
        };
      },
      onUploadCompleted: async () => {
        // Files are listed directly from Blob, so nothing to persist here.
      },
    });
    return Response.json(json);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload failed." },
      { status: 400 },
    );
  }
}
