const faqEntries = [
  ['Dərslər necə keçirilir?', 'Dərslər fərdi və onlayn keçirilir. Müəllimlə canlı söhbət edirsən, yeni sözləri və cümlə quruluşlarını danışıqda məşq edirsən.'],
  ['Səviyyəm necə müəyyən olunur?', '15 dəqiqəlik tanışlıq görüşündə müəllim səviyyəni və məqsədini öyrənir. Sonra uyğun dərs planını birlikdə müəyyənləşdirirsiniz.'],
  ['Dərsin vaxtını dəyişə bilərəm?', 'Bəli. Platformada müəllimin boş saatlarını görüb sənə uyğun yeni vaxt üçün müraciət edə bilərsən.'],
  ['Hansı ingilis dili proqramları var?', 'Ümumi danışıq, akademik və texniki ingilis dili üzrə proqramlarımız var. Proqramı məqsədinə uyğun seçə bilərsən.'],
  ['İrəliləyişimi haradan izləyə bilərəm?', 'Platformada dərs cədvəlini və bacarıqlar üzrə nəticələrini görə bilərsən. Müəllim hansı bacarığa daha çox vaxt ayırmalı olduğunu izah edir.'],
];

function homeFAQs() {
  return `<section id="suallar" class="home-section home-faq" aria-labelledby="faq-title" data-home-sky="faq">
    <div class="paper-flight">
      <div class="wrap section-split paper-scene">
        <h2 id="faq-title">Tez-tez verilən <em>suallar</em></h2>
        <div class="faq-fold-area" data-paper-area>
          <div class="faq-paper paper-sheet">
            ${faqEntries.map(([question, answer], index) => `<div class="faq-item">
              <h3 class="faq-question">
                <button type="button" class="faq-toggle" aria-expanded="false" aria-controls="faq-answer-${index + 1}">${question}</button>
              </h3>
              <div class="faq-answer-panel" id="faq-answer-${index + 1}" inert>
                <div class="faq-answer-inner"><p class="faq-answer">${answer}</p></div>
              </div>
            </div>`).join('')}
          </div>
          <canvas class="faq-fold-art" aria-hidden="true"></canvas>
          <button type="button" class="paper-open faq-fold-open" hidden><span>Kağızı aç</span></button>
        </div>
      </div>
    </div>
  </section>`;
}

function setupFaqQuestions() {
  let expandedQuestion = null;

  function setExpanded(question, expanded) {
    question.setAttribute('aria-expanded', expanded);
    document.getElementById(question.getAttribute('aria-controls')).inert = !expanded;
  }

  for (const question of document.querySelectorAll('.faq-toggle')) {
    question.addEventListener('click', () => {
      const next = expandedQuestion === question ? null : question;
      if (expandedQuestion) setExpanded(expandedQuestion, false);
      if (next) setExpanded(next, true);
      expandedQuestion = next;
    });
  }
}

function setupPaperArt() {
  setupFaqQuestions();
  setupScrollPapers();
}
