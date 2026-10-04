# Permaculture Design Management Game

This module is a simulation game that allows players to design and manage a permaculture system. The game aims to educate players about the principles and practices of permaculture, a sustainable approach to agriculture and land management.

## Features

- Interactive map where players can design their permaculture system
- Ability to place various elements such as patches of plants and bigger shrubs and trees on the map. 
- This Tree and shrubs elements have various attributes such as height, width, human usages, ecological system services, etc on it.
- Tools For
    - Cenverting a List of plants to plant data by downloading the data from the Plants for a Future and NaturaDB Web Sites
    - Checking Downloaded Data for Errors
    - Transforming SVG Assets acconding the Plant Data and Scaling acconding your map.
    - Grouping generated SVGs in printable Pages.

## Getting Started

1. Install the PermacultureDesignManagementGame module from the PowerShell Gallery:
`Install-Module -Name PermacultureTreeGuildsDesigner`
2. Call Copy-ExamplePlantNames Command
3. Edit the PlantNames.txt file and add all latin plant names you want to use in your game.
4. Call the ConvertFrom-PlantList command to generate the of SVGs.

## Create your own tree guilds

All tree guilds are defined as SVG files in the assets folder at the module root path.
If you want to create your own tree guilds, you can use the SVG editor of your choice to create your own SVG files. The field within the tree guilds are defined as SVG XML elements. Each of the fields is identified by a unique ID. 

The ID is seperated in 3 sections devided by an underscore. 1 section is the ID prefix, the 2nd section is the Name of the element and the 3rd section is the suffix of the element.

ID prefixes descibes how the element is used.
| Prefix | Description |
| --- | --- |
| t_ | Text element wich contains the text as XML text. The existing text will be replaced by the new text. |
| b_ | Boolean element is of SVG element type path. The visibility of the element will assigned by the changing the style of the element. |
| h_ | Hidden element wich contains other elements amd is of diffent SVG element types. The visibility of the element will assigned by the changing the style of the element. |
g_ | Group element wich contains other elements amd is of SVG element type g. The visibility of the element will assigned by the changing the style of the element.

ID suffixes descibes the SVG element type.
| Suffix | Description |
| --- | --- |
| _text | Text element wich contains the text as XML text. |
| _icon | Icon element wich contains the icon as SVG path. |
| _group | Group element wich contains other elements amd is of SVG element type g. |

Here is an list of the fields and their IDs:

### Text Elements

All text elements have t_ as ID prefix and have to be of the element type text.
| Element ID | Description |
| --- | --- |
| t_latin-name_text | Latin name of the plant. |
| t_common-name_text | Common name of the plant. |
| t_width_text | Full width of the adult tree. Have to be a number and metric unit of meter. 0.75m for example. |
| t_height_text | Full height of the adult tree. Have to be a number and metric unit of meter. 0.75m for example. |
| t_meds-score_text | Score of the plant for the medicale usability of the trees components. |
| t_material_score_text | Score of the plant for the material usability of the trees components as building meterial.|
| t_eatable-score_text | Score of the plant for the edible usability of the trees components. |
| t_climate-zone_text | USDA Climate zone of the plant. |

### hidable elements 

The visibility of the elements can be controlled by boolean values. If the value is true, the element is visible, if the value is false, the element is hidden. All hidable elements have a h_ as ID prefix. 

| ID | Description |
| --- | --- |
| h_wind-breating_group | Is the plant wind-breating? |
| h_wind-breaking_icon | Is the plant wind-breaking? |
| h_width_icon | Is the plant width icon visible? Should be visible if the plant has a width. |
| h_wet_group | If the plant is able to grow in wet soil? |
| h_water-wet_icon | If the plant is a very wet soil? |
| h_water-mid_icon | If the plant is a medium wet soil? |
| h_water-dry_icon | If the plant is a growing dry soil? |
| h_walter-plant_icon | Is the plant a walter plant? |
| h_sun-shadow_icon | If the plant is a shadow tolerant plant? |
| h_sun-mid_icon | If the plant is a growing in half shadow? |
| h_sun-full_icon | If the plant is a growing in full sun? |
| h_sun_group | If the plant is a growing in full sun? |
| h_plant-nutrition_group | If the plant is a plant that can be used for nutrition? |
| h_ph_text | constant text PH. |
| h_ph_group | visibility of the PH fields. |
| h_pest_icon | visibility of the pest icon. |
| h_pest_group | visibility of the pest field. |
| h_nitrogen-fix-icon | visibility of the nitrogen fixing plant icon. |
| h_mineral-fix_icon | visibility of the dynamic accumulator plant icon. |
| h_mineral-fix_group | visibility of the dynamic accumulator field. |
| h_meds_icon | visibility of the medicale usability icon. |
| h_meds_group | visibility of the medicale usability field. |
| h_material_icon | visibility of the material as building wood usability icon. |
| h_material_group | visibility of the material as building wood field. |
| h_insects_icon | visibility of the insect icon. |
| h_insects_group | visibility of the insect field. |
| h_human-usages_group | visibility of the human usages field. |
| h_hight_icon | visibility of the height icon. |
| h_grow-speed_group | visibility of the grow speed field. |
| h_ground-cover_icon | visibility of the ground cover icon. |
| h_ground-cover_group | visibility of the ground cover field. |
| h_fuel_icon | visibility of the fuel icon. |
| h_fuel_group | visibility of the fuel field. |
| h_fruit_icon | visibility of the fruit icon. |
| h_fruit_group | visibility of the fruit field. |
| h_for-future-use_group | visibility of the for future use fields. |
| h_fodder_icon | visibility of the fodder icon. |
| h_fodder_group | visibility of the fodder field. |
| h_flower_icon | visibility of the flower icon. |
| h_flower_group | visibility of the flower field. |
| h_eco-system-functions_group | visibility of the eco system functions field. |
| h_eatable_icon | visibility of the eatable icon. |
| h_eatable_group | visibility of the eatable field. |
| h_culinaric_icon | visibility of the culinaric icon. |
| h_culinaric_group | visibility of the culinaric field. |
| h_climate-zone_group | visibility of the climate zone field. |
| h_climate-icon | visibility of the climate zone icon. |
| h_animal-protection_icon | visibility of the animal protection icon. |
| h_animal-protection_group | visibility of the animal protection field. |

# for future use
| field |
| --- |
| h_path33 |
| h_path32 |
| h_path31 |
| h_path30 |
| h_path29 |
| h_path28 |
| h_path26 |
| h_path25 |
| h_path23 |
| h_path22 |
| h_path21 |
| h_slot2_group |
| h_slot-3_group |
| h_slot-3_element |
| h_slot-2_element |
| h_slot-1_group |
| h_slot-1_element |

| ID | Description |
| --- | --- |
| g_Info-Label_group |  visibility of the info label. |

### Option elements
The option elements are used to select multiple plant property out of a list of options. The option elements have a b_ as ID prefix.
| field | description |
| --- | --- |
| b_wind-breaking-on-sea_icon | Is the plant wind-breaking near sea? |
| b_wind-breaking_element | Is the plant wind-breaking? |
| b_water-wet_element | If the plant is a very wet soil? |
| b_water-plant_element | If the plant is a very wet soil? | 
| b_water-mid_element | If the plant is a medium wet soil? |
| b_water-dry_element | If the plant is a growing in dry soil? |
| b_sun-full_element | If the plant is a growing in full sun? | 
| b_sun_shadow_element | If the plant is a shadow tolerant plant? |
| b_sun_mid_element | If the plant is a growing in half shadow? |
| b_ph-very-alkaline_element | If the plant is a very alkaline soil? |
| b_ph-very-acid_element | If the plant is a very acid soil? |
| b_ph-saline_element | If the plant is a growing in saline soil? | 
| b_ph-neutral_element | If the plant is a growing in neutral soil? |
| b_ph-alkaline_element | If the plant is a growing in alkaline soil? |
| b_ph-acid_element | If the plant is a growing in acid soil? |
| b_pest_element | visibility of the pest icon. |
| b_nitrogen-fix-element | visibility of the nitrogen fixing plant icon. |
| b_mineral-fix-element | visibility of the dynamic accumulator plant icon. |
| b_meds_element | visibility of the medicale usability icon. |
| b_material_element | visibility of the material as building wood usability icon. |
| b_insects_element | visibility of the insect icon. |
| b_grow-speed-mid_icon | If the plant is a growing in medium speed? |
| b_grow-speed-low_icon  | If the plant is a growing in low speed? |
| b_grow-speed-high_icon | If the plant is a growing in high speed? |
| b_ground-cover_element | visibility of the ground cover icon. |
| b_fuel_element | visibility of the fuel icon. |
| b_fruit-0_element | visibility of the fruit indicator for january. |
| b_fruit-1_element | visibility of the fruit indicator for february. |
| b_fruit-2_element | visibility of the fruit indicator for march. |
| b_fruit-3_element | visibility of the fruit indicator for april. |
| b_fruit-4_element | visibility of the fruit indicator for may. |
| b_fruit-5_element | visibility of the fruit indicator for june. |
| b_fruit-6_element | visibility of the fruit indicator for july. |
| b_fruit-7_element | visibility of the fruit indicator for august. |
| b_fruit-8_element  | visibility of the fruit indicator for september. |
| b_fruit-9_element | visibility of the fruit indicator for october. |
| b_fruit-10_element | visibility of the fruit indicator for november. |
| b_fruit-11_element | visibility of the fruit indicator for december. |
| b_fodder_element | visibility of the fodder element. |
| b_flower-0_element  | visibility of the flower indicator for january. |
| b_flower-1_element  | visibility of the flower indicator for february. |
| b_flower-2_element | visibility of the flower indicator for march. |
| b_flower-3_element | visibility of the flower indicator for april. |
| b_flower-4_element | visibility of the flower indicator for may. |
| b_flower-5_element  | visibility of the flower indicator for june. |
| b_flower-6_element | visibility of the flower indicator for july. |
| b_flower-7_element | visibility of the flower indicator for august. |
| b_flower-8_element | visibility of the flower indicator for september. |
| b_flower-9_element | visibility of the flower indicator for october. |
| b_flower-10_element | visibility of the flower indicator for october. |
| b_flower-11_element | visibility of the flower indicator for november. |
| b_eatable_element | visibility of the eatable element. |
| b_culinaric_element | visibility of the culinaric element. |
| b_animal-protection_element | visibility of the animal protection element. |

## Contributing

We welcome contributions from the community! If you'd like to contribute, please follow these steps:

1. Fork the repository
2. Create a new branch for your feature or bug fix
3. Make your changes and commit them with descriptive commit messages
4. Push your changes to your forked repository
5. Submit a pull request to the main repository

Please ensure that your code follows our coding standards and includes appropriate tests.

## License

This project is **fair source**: published under the [Functional Source License 1.1, MIT Future License](LICENSE.md) (FSL-1.1-MIT).

- You may use, copy, modify and redistribute the code for any purpose **except a competing commercial product or service**.
- Internal use, non-commercial education and research, and consulting are explicitly allowed.
- Every version automatically becomes **MIT-licensed two years after it was published**.

Versions published before the switch (the commit tagged `fsl-start`) remain MIT-licensed. Details are in [`NOTICE`](NOTICE).

The web app is developed further as the [Perma Design Kit](https://github.com/tbdal/Perma-Design-Kit).

## Authors

- Sebastian Schucht ([@SZzip](https://github.com/SZzip))
- Jörn Müller ([@permagruen](https://github.com/permagruen), [permagruen.de](https://www.permagruen.de))
- Andreas Linder ([@tbdal](https://github.com/tbdal))
