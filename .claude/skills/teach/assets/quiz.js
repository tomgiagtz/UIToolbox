/* Reusable retrieval-practice quiz widget, shared across lessons.
 *
 * Markup contract (styles live in lesson.css):
 *   <div class="quiz">
 *     <div class="qblock" data-answer="1">
 *       <p class="q">Question text?</p>
 *       <ul class="opts">
 *         <li><button class="opt">First option</button></li>
 *         <li><button class="opt">Second option</button></li>   <!-- index 1 = correct -->
 *       </ul>
 *       <p class="feedback" data-correct="Why this is right." data-wrong="Nudge to reconsider."></p>
 *     </div>
 *   </div>
 *
 * Correct answer is the zero-based index in data-answer. Answers should be
 * equal length so formatting leaks no clues (see SKILL.md).
 */
(function () {
  function initBlock(block) {
    var answer = parseInt(block.getAttribute("data-answer"), 10);
    var buttons = Array.prototype.slice.call(block.querySelectorAll("button.opt"));
    var feedback = block.querySelector(".feedback");
    var done = false;

    buttons.forEach(function (btn, i) {
      btn.addEventListener("click", function () {
        if (done) return;
        done = true;
        buttons.forEach(function (b, j) {
          b.disabled = true;
          if (j === answer) b.classList.add("correct");
        });
        if (i !== answer) btn.classList.add("wrong");
        if (feedback) {
          var msg = i === answer
            ? feedback.getAttribute("data-correct")
            : feedback.getAttribute("data-wrong");
          feedback.textContent = msg || (i === answer ? "Correct." : "Not quite.");
          feedback.classList.add("show");
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".quiz .qblock").forEach(initBlock);
  });
})();
