class ExportXls

    def call
        @list = ['4620061480427', '4650168491040', '4650168491057', '4650168491125', '4680259207540']
        @cat = 130
    end

    def stage1
        KEY = '7dc4e624f3811b5d195a1712374912a4'
    
        url = URI.open("https://www.galacentre.ru/api/v2/catalog/xml/?section=130&key=" + KEY)
        doc = Nokogiri::XML(url)
        
        res = []

        doc.xpath("//offer").each do |i| 

            if i['name'] == 'barcode' && @list.include?(i.content)
                res << [i.content, i['id']]
            end

        end

        res
    end

    def stage2
        book = Spreadsheet::Workbook.new
        
        sheet1 = book.create_worksheet name: 'test'
        sheet1.column(1).width = 25
        sheet1.column(2).width = 25
        sheet1.column(3).width = 25
        sheet1.column(4).width = 35

        bg_green = Spreadsheet::Format.new pattern_bg_color: 'yellow',
                                            pattern_fg_color: 'yellow',
                                            pattern: 1,
                                            color: 'black',
                                            border: :medium,
                                            border_color: :black

        rownum = 0

        ['Марка', 'Номер', 'Наименование', 'Кол.'].each_with_index do |name, inx|
            sheet1.row(rownum).push name
            sheet1.row(rownum).set_format(inx, bg_green)
          end

    
        rownum += 1

        sheet1.row(rownum).push '111'
        sheet1.row(rownum).push '222'
        sheet1.row(rownum).push '333'
        sheet1.row(rownum).push '444'

        book
    end

    def stage3
        file = File.expand_path File.join(Rails.root, 'tmp', "text.xls")
        book = ExportXls.new.call
        book.write file

        File.open(file, 'r') do |f|
            send_data f.read, type: "application/excel", filename: "text.xls"
        end
    end

end