// $(document).ready(function(){

//     $.get('/get_category', {}, function(res){
//         $('.cat_store').html(res);
//     })

//     $(document).on('click', '.apply_butt', function(){

//         $('.form_block').addClass('no_active');

//         var data = {
//             cat_store: $('.cat_store').val(),
//             cat_temp: $('.cat_temp').val(),
//             list_barcodes: $('.list_barcodes').val(),
//             list_emails: $('.list_emails').val()
//         }

//         $.post('/parsing_start', data, function(res){
            
//             $('.form_block').removeClass('no_active');

//             if(res == 'start') {
//                 $('.form_block').empty().html("<center>Процесс запущен. Ждите ответа на почту!<br><a href='/' class='text-blue-900'>Новый запрос</a></center>")
//             } else {
//                 alert('Произошла ошибка при запуске. Повторите заново!');
//             }
            
//         })

//     })

// })