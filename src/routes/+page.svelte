<script>
	import { invalidateAll } from '$app/navigation';
    import { onMount } from 'svelte';
    
    let { data } = $props();

    let canvas_url = $state("");
    let canvas_session = $state("");
    let csrf_token = $state("");
    let log_session_id = $state("");

    let toastMessage = $state("");
    let showSetup = $state(false);
    let isLoading = $state(true);
    let expandedUpcoming = $state({});

    onMount(() => {
        isLoading = false;
    });

    const validate = async () => {
        if (!canvas_url) 
            return toastMessage = "Canvas base URL must be provided";

        if (!canvas_session) 
            return toastMessage = "Canvas Session must be provided";

        if (!csrf_token) 
            return toastMessage = "CSRF Token must be provided";

        if (!log_session_id) 
            return toastMessage = "Log Session ID must be provided";

        const result = await fetch("/add", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                canvas_url,
                csrf_token,
                canvas_session,
                log_session_id
            })
        });

        if (result.ok) {
            const data = await result.json();

            if (data.success) {
                await cookieStore.set({
                    name: `student_${data.id}`,
                    value: JSON.stringify({ 
                        canvas_url,
                        canvas_session, 
                        csrf_token,
                        log_session_id,
                        name: data.name,
                        id: data.id
                    }),
                    expires: Date.now() + 180 * 24 * 60 * 60 * 1000
                });

                canvas_session = "";
                csrf_token = "";
                log_session_id = "";
                showSetup = false;

                await invalidateAll();
            } else {
                return toastMessage = data.error;
            }
        } else {
            return toastMessage = "Invalid server response";
        }
    }

    const students = $derived(data.students ?? []);

    const groupedAssignments = (items) => Object.groupBy(items, (item) => item.course);

    // const reason = (grades, results) => {
    //     const allAs = !!grades.filter(t => t.grade !== 'A' && t.grade !== 'N/A').length;
    //     const noLateAssignments = !results.late.length;
    //     const noDueAssignments = !results.due.length;

    //     if ()
    // }

    const isDone = (grades, results) => {
        if (!grades || !results) return "error";
        const allAs = grades.filter(t => t.grade !== 'A' && t.grade !== 'N/A').length === 0;
        const noLateAssignments = !results.late.length;
        const noDueAssignments = !results.due.length;

        if (allAs && noLateAssignments && noDueAssignments) {
            return "done";
        } else {
            return "not-done";
        }
    };

    const deleteStudent = async (studentId) => {
        if (confirm('Are you sure you want to remove this student?')) {
            await cookieStore.delete({
                name: `student_${studentId}`
            });
            await invalidateAll();
        }
    };

    const sortByDate = (items) => {
        return items.sort((a, b) => new Date(a.due) - new Date(b.due));
    }

    function stringToHexColor(str) {

        str += "abcd";
        let hash = 0;
        
        // Generate a hash code from the string
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Convert the hash into a 6-character hex color code
        let color = '#';
        for (let i = 0; i < 3; i++) {
            const value = (hash >> (i * 8)) & 0xFF;
            color += value.toString(16).padStart(2, '0');
        }
        
        return color;
    }

</script>

<svelte:head>
	<title>Student Dashboard</title>
	<meta name="description" content="" />
</svelte:head>

{#if isLoading}
    <div class="loading-overlay">
        <div class="loading-spinner"></div>
    </div>
{/if}

<main>
    {#if students.length === 0}
        <section>
            <h2>Setup student</h2>
            <article>
                <div class="setup-inputs">
                    <label for="canvas_url">
                        Canvas URL
                        <input type="text" bind:value={canvas_url} required />
                    </label>
                    <label for="canvas_session">
                        Canvas Session
                        <input type="text" bind:value={canvas_session} required />
                    </label>
                    <label for="csrf_token">
                        CSRF Token 
                        <input type="text" bind:value={csrf_token} required />
                    </label>
                    <label for="log_session_id">
                        Log Session ID
                        <input type="text" bind:value={log_session_id} required />
                    </label>
                </div>
                <button type="button" onclick={validate}>Setup</button>
            </article>
        </section>
    {:else}
        <div class="students-header">
            <h2>Students</h2>
            <button type="button" onclick={() => showSetup = true} class="add-student-btn">
                + Add Student
            </button>
        </div>
    {/if}

    <div class="students-container">
        {#each students as student}
        <article class="student-card">
            <div class="card-header">
                <div class="card-title">
                    <h2>{student.name}</h2>
                    <div class="status-badge {isDone(student.grades, student.results)}">
                        {#if isDone(student.grades, student.results) === "done"}
                            ✓ DONE
                        {:else}
                            ⚠ NOT FINISHED
                        {/if}
                    </div>
                </div>
                <button type="button" class="delete-btn" onclick={() => deleteStudent(student.id)} title="Remove this student">✕</button>
            </div>
            
            {#if student.error}
                <div class="error-message">Token expired</div>
            {:else}
                {#if isDone(student.grades, student.results) !== "done"}
                    <div class="card-content">
                        {#if !!student.results.late.length}
                            <div class="reason-section">
                                <h4>Late</h4>
                                <ul>
                                    {#each student.results.late as assignment}
                                        <li>
                                            <span class="course">{assignment.course}</span>
                                            <span class="assignment">{assignment.assignment}</span>
                                            <span class="due-date">{assignment.due?.toDateString()}</span>
                                        </li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}

                        {#if !!student.results.due.length}
                            <div class="reason-section">
                                <h4>Due today</h4>
                                <ul>
                                    {#each student.results.due as assignment}
                                        <li>
                                            <span class="course">{assignment.course}</span>
                                            <span class="assignment">{assignment.assignment}</span>
                                        </li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                        
                        {#if student.grades.filter(t => t.grade !== 'A' && t.grade !== 'N/A').length > 0}
                            <div class="reason-section">
                                <h4>Grades too low</h4>
                                <ul>
                                    {#each student.grades.filter(t => t.grade !== 'A' && t.grade !== 'N/A') as grade}
                                        <li>
                                            <span class="course">{grade.course}</span>
                                            <span class="grade-badge">{grade.grade}</span>
                                            <span class="score">({grade.score}%)</span>
                                        </li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                    </div>
                {/if}
                <div class="card-content">
                    <div class="reason-section collapsible">
                        <div class="collapsible-header" onclick={() => expandedUpcoming[student.id] = !expandedUpcoming[student.id]}>
                            <h4>Upcoming assignments</h4>
                            <span class="collapse-icon" class:expanded={expandedUpcoming[student.id]}>▶</span>
                        </div>
                        {#if expandedUpcoming[student.id]}
                        <ul>
                            {#each sortByDate(student.results.upcoming.filter(t => t.due && t.due < new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))) as assignment}
                                <li 
                                    class:tomorrow={new Date(assignment.due).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }).split(',')[0] === new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }).split(',')[0]}
                                    class:twodays={new Date(assignment.due).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }).split(',')[0] === new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }).split(',')[0]}
                                    class:threedays={new Date(assignment.due).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }).split(',')[0] === new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }).split(',')[0]}>
                                    <span class="course" style="color:{stringToHexColor(assignment.course)}">{assignment.course}</span>
                                    <span class="assignment">{assignment.assignment}</span>
                                    <span class="due-date">{assignment.due?.toDateString()}</span>
                                </li>
                            {/each}
                        </ul>
                        {/if}
                    </div>
                </div>

            {/if}
        </article>
        {/each}
    </div>

    {#if showSetup}
        <div class="modal-overlay" onclick={() => showSetup = false}>
            <div class="modal-dialog" onclick={(e) => e.stopPropagation()}>
                <div class="modal-header">
                    <h2>Add Student</h2>
                    <button type="button" class="modal-close" onclick={() => showSetup = false}>✕</button>
                </div>
                <div class="modal-body">
                    <div class="instructions-section">
                        <h3>How to get this session</h3>
                        <ol class="instructions-list">
                            <li>Login to canvas in Chrome</li>
                            <li>Open the developer console (right click then "Inspect" or press F12)</li>
                            <li>Click the Application tab</li>
                            <li>Expand "Cookies" under Storage in the left menu</li>
                            <li>Click the site name</li>
                            <li>Copy the relevant value from each cookie into the inputs below</li>
                        </ol>
                    </div>
                    <div class="privacy-note">
                        <strong>🔒 Your privacy</strong> 
                        <br/>This information is stored locally in your browser and is only used to look up your student details from Canvas.
                    </div>
                    <br/>
                    <div class="setup-inputs">
                        <label for="canvas_url">
                            Canvas URL
                            <input type="text" bind:value={canvas_url} required />
                        </label>
                        <label for="canvas_session">
                            canvas_session
                            <input type="text" bind:value={canvas_session} required />
                        </label>
                        <label for="csrf_token">
                            _csrf_token
                            <input type="text" bind:value={csrf_token} required />
                        </label>
                        <label for="log_session_id">
                            log_session_id
                            <input type="text" bind:value={log_session_id} required />
                        </label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="cancel-btn" onclick={() => showSetup = false}>Cancel</button>
                    <button type="button" class="submit-btn" onclick={validate}>Add Student</button>
                </div>
            </div>
        </div>
    {/if}
</main>

<style>
    main {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem;
    }

    .students-container {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1.5rem;
        margin-top: 2rem;
    }

    /* Mobile and Tablet: full width single column */
    @media (max-width: 768px) {
        .students-container {
            grid-template-columns: 1fr;
        }
    }

    /* Desktop: 3 columns max */
    @media (min-width: 769px) {
        .students-container {
            grid-template-columns: repeat(3, 1fr);
        }
    }

    .student-card {
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transition: box-shadow 0.3s ease;
        padding: 1.5rem;
    }

    .student-card:hover {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1rem;
        padding-bottom: 1rem;
        border-bottom: 2px solid #f0f0f0;
        gap: 0.75rem;
    }

    .card-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex: 1;
    }

    .card-header h2 {
        margin: 0;
        font-size: 1.3rem;
    }

    .delete-btn {
        background: none;
        border: none;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0.25rem;
        color: #999;
        transition: color 0.2s ease, transform 0.2s ease;
        flex-shrink: 0;
    }

    .delete-btn:hover {
        color: #d32f2f;
        transform: scale(1.1);
    }

    .status-badge {
        padding: 0.5rem 1rem;
        border-radius: 20px;
        font-size: 0.85rem;
        font-weight: 600;
        white-space: nowrap;
    }

    .status-badge.done {
        background-color: #d4edda;
        color: #155724;
    }

    .status-badge.not-done {
        background-color: #fff3cd;
        color: #856404;
    }

    .error-message {
        color: #d32f2f;
        padding: 1rem;
        background-color: #ffebee;
        border-radius: 4px;
        margin-top: 1rem;
    }

    .card-content {
        margin-top: 1rem;
    }

    .card-content h3 {
        margin-top: 0;
        color: #333;
    }

    .reason-section {
        margin-bottom: 1.5rem;
    }

    .reason-section h4 {
        color: #555;
        margin-bottom: 0.75rem;
        font-size: 0.95rem;
    }

    .reason-section ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .reason-section li {
        padding: 0.75rem;
        margin-bottom: 0.5rem;
        background-color: #f9f9f9;
        border-left: 3px solid #ff0000;
        border-radius: 4px;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .reason-section li:last-child {
        margin-bottom: 0;
    }

    .reason-section li.tomorrow {
        border-left: 3px solid #acd4ff !important;
    }

    .reason-section li.twodays {
        border-left: 3px solid #deeeff !important;
    }

    .reason-section li.threedays {
        border-left: 3px solid #eef6ff !important;
    }

    .course {
        font-weight: 600;
        color: #007bff;
        font-size: 0.9rem;
    }

    .assignment {
        color: #333;
    }

    .due-date {
        font-size: 0.85rem;
        color: #999;
    }

    .grade-badge {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        background-color: #ffcdd2;
        color: #c62828;
        border-radius: 4px;
        font-weight: 600;
        font-size: 0.85rem;
    }

    .score {
        font-size: 0.85rem;
        color: #666;
    }

    section {
        margin-bottom: 2rem;
    }

    article {
        background-color: white;
    }

    button {
        background-color: #007bff;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
        font-weight: 500;
        transition: background-color 0.3s ease;
    }

    button:hover {
        background-color: #0056b3;
    }

    input {
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 1rem;
        width: 100%;
        box-sizing: border-box;
    }

    label {
        display: block;
        margin-bottom: 1rem;
        font-weight: 500;
    }

    .setup-inputs {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
        flex-wrap: wrap;
    }

    .setup-inputs label {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 200px;
        margin-bottom: 0;
    }

    .setup-inputs input {
        margin-top: 0.5rem;
    }

    .students-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
    }

    .students-header h2 {
        margin: 0;
    }

    .add-student-btn {
        background-color: #28a745;
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
    }

    .add-student-btn:hover {
        background-color: #218838;
    }

    .setup-section {
        margin-top: 3rem;
        padding-top: 2rem;
        border-top: 2px solid #e0e0e0;
    }

    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .modal-dialog {
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid #e0e0e0;
    }

    .modal-header h2 {
        margin: 0;
    }

    .modal-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #666;
        padding: 0;
        width: 2rem;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .modal-close:hover {
        color: #333;
        background-color: #f0f0f0;
        border-radius: 4px;
    }

    .modal-body {
        padding: 1.5rem;
    }

    .modal-body .setup-inputs {
        flex-direction: column;
        margin-bottom: 0;
    }

    .modal-body .setup-inputs label {
        min-width: auto;
    }

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        padding: 1.5rem;
        border-top: 1px solid #e0e0e0;
    }

    .cancel-btn {
        background-color: #6c757d;
    }

    .cancel-btn:hover {
        background-color: #5a6268;
    }

    .submit-btn {
        background-color: #007bff;
    }

    .submit-btn:hover {
        background-color: #0056b3;
    }

    .instructions-section {
        background-color: #f8f9fa;
        border-left: 4px solid #007bff;
        padding: 1.25rem;
        border-radius: 4px;
        margin-bottom: 1.5rem;
    }

    .instructions-section h3 {
        margin-top: 0;
        margin-bottom: 1rem;
        color: #007bff;
        font-size: 1.1rem;
    }

    .instructions-list {
        margin: 0;
        padding-left: 1.5rem;
        list-style-type: decimal;
    }

    .instructions-list li {
        margin-bottom: 0.35rem;
        color: #333;
        line-height: 1.6;
    }

    .instructions-list li:last-child {
        margin-bottom: 0;
    }

    .privacy-note {
        margin-top: 1rem;
        padding: 0.75rem;
        background-color: #e8f5e9;
        border-left: 3px solid #4caf50;
        border-radius: 3px;
        font-size: 0.9rem;
        color: #2e7d32;
    }

    .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.3);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
    }

    .loading-spinner {
        width: 50px;
        height: 50px;
        border: 4px solid rgba(0, 0, 0, 0.1);
        border-top-color: #007bff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .collapsible-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        user-select: none;
        margin-bottom: 1em;
    }

    .collapsible-header:hover {
        opacity: 0.8;
    }

    .collapsible-header h4 {
        margin: 0;
        flex: 1;
    }

    .collapse-icon {
        display: inline-block;
        transition: transform 0.2s ease;
        color: #666;
        font-size: 0.8rem;
    }

    .collapse-icon.expanded {
        transform: rotate(90deg);
    }
</style>