import { getToken, getStudentDetails, fetchMyGrades, getAllDueAssignments } from '$lib/server/canvas.js';
import { env } from '$env/dynamic/private';

export const load = async ({ cookies }) => {
    const allCookies = cookies.getAll();

    const cookieKeys = allCookies.map(c => c.name).filter(t => t.startsWith("student_"));

    const students = [];

    for (let key of cookieKeys) {
        const cookie = cookies.get(key);

        if (cookie) {
            const studentInfo = JSON.parse(cookie);
            const token = getToken(studentInfo.canvas_session, studentInfo.csrf_token, studentInfo.log_session_id);
            
            try {
                const student = await getStudentDetails(env.canvas_url, token);

                if (student) {
                    const grades = await fetchMyGrades(env.canvas_url, token, student.id);

                    if (!grades) {
                        students.push({
                            id: student.id,
                            name: student.first_name,
                            grades: null,
                            results: null,
                            error: "Token expired"
                        });
                        continue;
                    }

                    const results = await getAllDueAssignments(env.canvas_url, token, student.id);

                    if (!results) {
                        students.push({
                            id: student.id,
                            name: student.first_name,
                            grades: null,
                            results: null,
                            error: "Token expired"
                        });
                        continue;
                    }

                    students.push({
                        id: student.id,
                        name: student.first_name,
                        grades,
                        results,
                        error: null
                    });
                }
            } catch (err) {
                students.push({
                    id: studentInfo.id,
                    name: studentInfo.name,
                    grades: null,
                    results: null,
                    error: "Token expired"
                });
            }
        }
    }

    return {
        students
    };
};