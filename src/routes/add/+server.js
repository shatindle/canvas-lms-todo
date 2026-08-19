import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { getStudentDetails, getToken } from '$lib/server/canvas';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
    const {
        csrf_token,
        canvas_session,
        log_session_id
    } = await request.json();

    const token = getToken(canvas_session, csrf_token, log_session_id);

    try {
        const student = await getStudentDetails(env.canvas_url, token);
        return json({ success: true, id: student.id, name: student.name });
    } catch {
        return json({ success: false, id: null, name: null });
    }
}